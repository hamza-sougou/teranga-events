import { randomBytes, randomInt } from 'crypto';
import { BadRequestException, ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { MemberRole, MemberStatus, Prisma, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { generateSecret, generateURI, verify as verifyTotp } from 'otplib';
import { PrismaService } from '../prisma/prisma.service';
import { EmailChannel } from '../notifications/channels/email.channel';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CompleteGoogleSignupDto } from './dto/complete-google-signup.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';

const GOOGLE_PENDING_TOKEN_TTL = '15m';
const VERIFICATION_CODE_TTL_MINUTES = 15;
const VERIFICATION_CODE_MAX_ATTEMPTS = 5;
const GOOGLE_SIGNUP_PURPOSE = 'google_signup';

// Super Admin 2FA (docs/SPEC.md §10.7). The temp token below carries a
// `userId` claim rather than `sub` — same reasoning as the Google pending
// token: it must never be mistakable for, or accepted as, a normal access
// token by JwtStrategy (which requires `sub`).
const SUPER_ADMIN_TOTP_PURPOSE = 'super_admin_totp';
const SUPER_ADMIN_TOTP_TOKEN_TTL = '5m';
const SUPER_ADMIN_SESSION_TTL = '2h';
const SUPER_ADMIN_TOTP_MAX_FAILED_ATTEMPTS = 5;
const SUPER_ADMIN_TOTP_LOCKOUT_MINUTES = 15;
const SUPER_ADMIN_RECOVERY_CODE_COUNT = 10;
const TOTP_ISSUER = 'Zen Events';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics after NFD (é -> e, etc.)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

interface GoogleProfile {
  googleId: string;
  email: string;
  fullName: string;
}

interface GooglePendingTokenPayload {
  purpose: typeof GOOGLE_SIGNUP_PURPOSE;
  googleId: string;
  email: string;
  fullName: string;
}

type GoogleContinueResult =
  | { status: 'login' | 'login_linked'; accessToken: string; user: ReturnType<AuthService['sanitizeUser']> }
  | { status: 'signup_pending'; pendingToken: string };

interface SuperAdminTotpTokenPayload {
  purpose: typeof SUPER_ADMIN_TOTP_PURPOSE;
  userId: string;
}

type LoginResult =
  | { accessToken: string; user: ReturnType<AuthService['sanitizeUser']> }
  | { status: 'totp_setup_required' | 'totp_required'; totpToken: string };

interface SuperAdminLoginMeta {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly emailChannel: EmailChannel,
  ) {}

  async register(dto: RegisterDto) {
    if (dto.password !== dto.passwordConfirmation) {
      throw new BadRequestException('Passwords do not match');
    }

    await this.assertEmailAvailableForClassicRegistration(dto.email);

    const passwordHash = await bcrypt.hash(dto.password, 10);

    let user: User;
    try {
      user = await this.createOrganizerAccountAutoNamed({
        email: dto.email,
        fullName: dto.fullName,
        passwordHash,
        marketingOptIn: dto.marketingOptIn,
        termsAcceptedAt: new Date(),
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Email already in use');
      }
      throw error;
    }

    await this.issueVerificationCode(user);

    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto): Promise<LoginResult> {
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: dto.email, mode: 'insensitive' } },
    });

    if (!user || !user.isActive || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Never issue a full session directly for a Super Admin — the password
    // alone only earns a short-lived TOTP token. Branching happens only
    // after the password has already been verified, so this adds no new
    // account-enumeration signal beyond what a wrong password already gives
    // everyone else.
    if (user.isSuperAdmin) {
      const totpToken = this.signSuperAdminTotpToken(user.id);
      // totpEnabledAt (not raw secret presence) is the source of truth: a
      // secret can exist from an abandoned setup attempt (temp token expired
      // before the QR was scanned) without ever having been confirmed. Using
      // secret presence here would strand that account on `totp_required`
      // with no way back into /setup — exactly the lockout risk this account
      // can't afford.
      const status = user.totpEnabledAt ? 'totp_required' : 'totp_setup_required';
      return { status, totpToken };
    }

    return this.buildAuthResponse(user);
  }

  // Cas `totp_setup_required` uniquement — voir docs/SPEC.md §10.7.
  async superAdminTotpSetup(totpToken: string) {
    const payload = this.decodeSuperAdminTotpToken(totpToken);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: payload.userId } });

    if (!user.isSuperAdmin) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    if (user.totpEnabledAt) {
      throw new BadRequestException('TOTP is already configured for this account');
    }

    const secret = generateSecret();
    const otpauthUrl = generateURI({ issuer: TOTP_ISSUER, label: user.email, secret });
    const recoveryCodes = this.generateRecoveryCodes();
    const recoveryCodeHashes = await Promise.all(recoveryCodes.map((code) => bcrypt.hash(code, 10)));

    // Overwrites any secret left over from a previous abandoned attempt
    // (temp token expired before verification) rather than rejecting —
    // otherwise a login that resolves to totp_setup_required could have no
    // way to actually reach a usable secret.
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        totpSecret: secret,
        totpRecoveryCodeHashes: recoveryCodeHashes,
        totpFailedAttempts: 0,
        totpLockedUntil: null,
      },
    });

    // Raw secret + recovery codes are only ever returned here, once — never
    // persisted in plaintext logs, never re-derivable from the hashes.
    return { otpauthUrl, secret, recoveryCodes };
  }

  // Cas `totp_setup_required` (première vérification, active le secret) et
  // `totp_required` (secret déjà actif) — voir docs/SPEC.md §10.7.
  async superAdminTotpVerify(totpToken: string, code: string, meta: SuperAdminLoginMeta = {}) {
    const payload = this.decodeSuperAdminTotpToken(totpToken);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: payload.userId } });

    if (!user.isSuperAdmin || !user.isActive) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // Account-level lockout, independent of the per-IP @Throttle on the
    // route: a TOTP code has no single stored value to exhaust like the
    // email verification code (it rotates every 30s), and a fresh temp
    // token is mintable on every /auth/login call — so the cap has to key
    // off the account, not the token or the caller's IP.
    if (user.totpLockedUntil && user.totpLockedUntil.getTime() > Date.now()) {
      throw new UnauthorizedException('Too many failed attempts — try again later');
    }

    if (!user.totpSecret) {
      throw new BadRequestException('TOTP setup has not been started for this account');
    }

    const looksLikeTotpCode = /^\d{6}$/.test(code);
    let verified = false;
    let consumedRecoveryHash: string | null = null;

    if (looksLikeTotpCode) {
      const result = await verifyTotp({ secret: user.totpSecret, token: code, epochTolerance: 30 });
      verified = result.valid;
    } else {
      for (const hash of user.totpRecoveryCodeHashes) {
        if (await bcrypt.compare(code, hash)) {
          verified = true;
          consumedRecoveryHash = hash;
          break;
        }
      }
    }

    if (!verified) {
      await this.registerFailedTotpAttempt(user);
      throw new UnauthorizedException('Invalid code');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        totpEnabledAt: user.totpEnabledAt ?? new Date(),
        totpFailedAttempts: 0,
        totpLockedUntil: null,
        ...(consumedRecoveryHash
          ? { totpRecoveryCodeHashes: user.totpRecoveryCodeHashes.filter((hash) => hash !== consumedRecoveryHash) }
          : {}),
      },
    });

    this.notifySuperAdminLogin(user, meta);

    return this.buildAuthResponse(user, SUPER_ADMIN_SESSION_TTL);
  }

  // Single entry point for both "Log in with Google" and "Sign up with
  // Google" — the frontend never needs to know which one it is ahead of
  // time, only the resolved status matters:
  //   - 'login': googleId already known, normal sign-in.
  //   - 'login_linked': email already belongs to a classic account without
  //     a linked googleId — safe to auto-link since Google already proved
  //     email ownership, but surfaced explicitly rather than silently
  //     collapsed into 'login' (see docs/SPEC.md conflict note).
  //   - 'signup_pending': identity never seen before — nothing is created;
  //     a short-lived pending token carries the verified Google identity to
  //     /auth/google/complete once the intermediate page is submitted.
  async continueWithGoogle(profile: GoogleProfile): Promise<GoogleContinueResult> {
    const byGoogleId = await this.prisma.user.findFirst({ where: { googleId: profile.googleId } });
    if (byGoogleId) {
      if (!byGoogleId.isActive) {
        throw new UnauthorizedException('Account disabled');
      }
      // Defense in depth: this path isn't normally reachable for a Super
      // Admin (the seed script never sets a googleId), but nothing else
      // structurally prevents it — see docs/SPEC.md §10.7.
      if (byGoogleId.isSuperAdmin) {
        throw new UnauthorizedException('Super admin accounts cannot sign in with Google');
      }
      return { status: 'login', ...this.buildAuthResponse(byGoogleId) };
    }

    const byEmail = await this.prisma.user.findFirst({
      where: { email: { equals: profile.email, mode: 'insensitive' } },
    });

    if (byEmail) {
      if (!byEmail.isActive) {
        throw new UnauthorizedException('Account disabled');
      }
      if (byEmail.isSuperAdmin) {
        throw new UnauthorizedException('Super admin accounts cannot sign in with Google');
      }
      const linked = byEmail.googleId
        ? byEmail
        : await this.prisma.user.update({
            where: { id: byEmail.id },
            data: { googleId: profile.googleId },
          });
      return { status: 'login_linked', ...this.buildAuthResponse(linked) };
    }

    const pendingToken = this.jwtService.sign(
      { purpose: GOOGLE_SIGNUP_PURPOSE, googleId: profile.googleId, email: profile.email, fullName: profile.fullName },
      { expiresIn: GOOGLE_PENDING_TOKEN_TTL },
    );
    return { status: 'signup_pending', pendingToken };
  }

  async getGooglePendingSignup(token: string) {
    const payload = this.decodeGooglePendingToken(token);
    return {
      email: payload.email,
      suggestedFullName: payload.fullName,
      suggestedOrganizationName: this.buildAutoOrganizationName(payload.fullName),
    };
  }

  async completeGoogleSignup(dto: CompleteGoogleSignupDto) {
    const payload = this.decodeGooglePendingToken(dto.pendingToken);
    const fullName = dto.fullName?.trim() || payload.fullName;
    const profile: GoogleProfile = { googleId: payload.googleId, email: payload.email, fullName };

    // Re-resolve in case of a race between token issuance and completion
    // (double submit from two tabs, or a conflicting account created for
    // this identity in the meantime) — idempotent rather than erroring on
    // what's usually just a duplicate click.
    const resolved = await this.continueWithGoogle(profile);
    if (resolved.status !== 'signup_pending') {
      return { accessToken: resolved.accessToken, user: resolved.user };
    }

    let user: User;
    try {
      user = await this.createOrganizerAccountAutoNamed({
        email: payload.email,
        fullName,
        googleId: payload.googleId,
        marketingOptIn: dto.marketingOptIn,
        termsAcceptedAt: new Date(),
        // Google already proved email ownership — no verification code.
        emailVerifiedAt: new Date(),
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const retry = await this.continueWithGoogle(profile);
        if (retry.status !== 'signup_pending') {
          return { accessToken: retry.accessToken, user: retry.user };
        }
        throw new ConflictException('Email already in use');
      }
      throw error;
    }

    return this.buildAuthResponse(user);
  }

  async verifyEmail(userId: string, dto: VerifyEmailDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (user.emailVerifiedAt) {
      return { success: true, alreadyVerified: true };
    }

    if (
      !user.emailVerificationCodeHash ||
      !user.emailVerificationCodeExpiresAt ||
      user.emailVerificationCodeExpiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException('Verification code expired or not found — request a new one');
    }

    if (user.emailVerificationAttempts >= VERIFICATION_CODE_MAX_ATTEMPTS) {
      throw new BadRequestException('Too many attempts — request a new code');
    }

    const matches = await bcrypt.compare(dto.code, user.emailVerificationCodeHash);
    if (!matches) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { emailVerificationAttempts: { increment: 1 } },
      });
      throw new BadRequestException('Invalid verification code');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        emailVerifiedAt: new Date(),
        emailVerificationCodeHash: null,
        emailVerificationCodeExpiresAt: null,
        emailVerificationAttempts: 0,
      },
    });

    return { success: true };
  }

  async resendVerificationCode(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (user.emailVerifiedAt) {
      throw new BadRequestException('Email already verified');
    }
    if (!user.passwordHash) {
      throw new BadRequestException('This account does not require email verification');
    }

    await this.issueVerificationCode(user);
    return { success: true };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId },
      include: { organization: { select: { id: true, name: true, slug: true, isVerified: true } } },
    });

    return { ...this.sanitizeUser(user), hasPassword: !!user.passwordHash, memberships };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (!user.passwordHash) {
      throw new BadRequestException(
        'This account uses Google Sign-In and has no password to change',
      );
    }

    const currentPasswordMatches = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!currentPasswordMatches) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });

    return { success: true };
  }

  // Classic registration only reaches createOrganizerAccount once this has
  // passed — split out so the 409 can distinguish "already a classic
  // account" from "Google-only account, sign in with Google instead"
  // (see docs/SPEC.md identity-conflict note) instead of relying solely on
  // the generic P2002 catch, which stays as a concurrency backstop.
  private async assertEmailAvailableForClassicRegistration(email: string): Promise<void> {
    const existing = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
    if (!existing) return;

    if (!existing.passwordHash && existing.googleId) {
      throw new ConflictException({
        statusCode: 409,
        error: 'GOOGLE_ACCOUNT_EXISTS',
        message: 'This email is registered via Google Sign-In — sign in with Google instead',
      });
    }

    throw new ConflictException('Email already in use');
  }

  private async issueVerificationCode(user: User): Promise<void> {
    const code = randomInt(100000, 1000000).toString();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + VERIFICATION_CODE_TTL_MINUTES * 60_000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationCodeHash: codeHash,
        emailVerificationCodeExpiresAt: expiresAt,
        emailVerificationAttempts: 0,
      },
    });

    // Fire-and-forget: the same "never block the critical path on an
    // external channel" stance as NotificationsService, but bypassing its
    // notifications-table + minute-cadence dispatch job — that latency is a
    // poor fit for a code with a 15-minute lifetime, and registration's
    // response shouldn't hang on SMTP round-trip time either way.
    this.emailChannel
      .send({
        to: user.email,
        subject: 'Votre code de vérification Zen Events',
        text: `Votre code de vérification est : ${code}. Il expire dans ${VERIFICATION_CODE_TTL_MINUTES} minutes.`,
      })
      .catch((error) => {
        this.logger.error(`Failed to send verification code to ${user.email}: ${(error as Error).message}`);
      });
  }

  private decodeGooglePendingToken(token: string): GooglePendingTokenPayload {
    let payload: GooglePendingTokenPayload;
    try {
      payload = this.jwtService.verify<GooglePendingTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired Google signup token');
    }

    // No `sub` claim on this token shape and a dedicated purpose claim, so
    // it's never mistakable for — nor accepted as — a normal access token.
    if (payload?.purpose !== GOOGLE_SIGNUP_PURPOSE) {
      throw new UnauthorizedException('Invalid or expired Google signup token');
    }

    return payload;
  }

  private buildAutoOrganizationName(fullName: string): string {
    const firstName = fullName.split(' ')[0] || fullName;
    return `Organisation de ${firstName}`;
  }

  // Every caller here auto-names the organization from fullName — never a
  // form field (see docs/SPEC.md). Retries the slug once on a unique-
  // constraint conflict: the base slug ("amadou-ba") is shared by every
  // user with the same first name, so two concurrent registrations can
  // both pass generateUniqueOrganizationSlug's read-then-decide check
  // before either has committed. Regenerating (which re-reads the DB, now
  // including the just-committed row) and retrying resolves that race
  // instead of surfacing a false conflict to a legitimate registration.
  private async createOrganizerAccountAutoNamed(data: {
    email: string;
    fullName: string;
    passwordHash?: string;
    googleId?: string;
    marketingOptIn?: boolean;
    termsAcceptedAt?: Date;
    emailVerifiedAt?: Date;
  }): Promise<User> {
    const organizationName = this.buildAutoOrganizationName(data.fullName);

    for (let attempt = 0; ; attempt++) {
      const organizationSlug = await this.generateUniqueOrganizationSlug(data.fullName);
      try {
        return await this.createOrganizerAccount({ ...data, organizationName, organizationSlug });
      } catch (error) {
        if (attempt === 0 && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          continue;
        }
        throw error;
      }
    }
  }

  private async createOrganizerAccount(data: {
    email: string;
    fullName: string;
    organizationName: string;
    organizationSlug: string;
    passwordHash?: string;
    googleId?: string;
    marketingOptIn?: boolean;
    termsAcceptedAt?: Date;
    emailVerifiedAt?: Date;
  }): Promise<User> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: data.email,
          fullName: data.fullName,
          passwordHash: data.passwordHash,
          googleId: data.googleId,
          marketingOptIn: data.marketingOptIn ?? false,
          termsAcceptedAt: data.termsAcceptedAt,
          emailVerifiedAt: data.emailVerifiedAt,
        },
      });

      const organization = await tx.organization.create({
        data: {
          name: data.organizationName,
          slug: data.organizationSlug,
          ownerUserId: user.id,
        },
      });

      await tx.organizationMember.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
          role: MemberRole.OWNER,
          status: MemberStatus.ACTIVE,
        },
      });

      return user;
    });
  }

  private async generateUniqueOrganizationSlug(seed: string): Promise<string> {
    const base = slugify(seed) || 'organisation';

    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = attempt === 0 ? base : `${base}-${randomBytes(3).toString('hex')}`;
      const exists = await this.prisma.organization.findUnique({ where: { slug: candidate } });
      if (!exists) {
        return candidate;
      }
    }

    return `${base}-${randomBytes(6).toString('hex')}`;
  }

  // expiresIn override is only ever used for the Super Admin session TTL
  // (docs/SPEC.md §10.7) — every other caller relies on the module-level
  // default (JWT_EXPIRES_IN).
  private buildAuthResponse(user: User, expiresIn?: string) {
    const accessToken = this.jwtService.sign({ sub: user.id }, expiresIn ? { expiresIn } : undefined);
    return { accessToken, user: this.sanitizeUser(user) };
  }

  private sanitizeUser(user: User) {
    const {
      passwordHash,
      googleId,
      emailVerificationCodeHash,
      emailVerificationCodeExpiresAt,
      emailVerificationAttempts,
      totpSecret,
      totpEnabledAt,
      totpRecoveryCodeHashes,
      totpFailedAttempts,
      totpLockedUntil,
      ...safeUser
    } = user;
    return safeUser;
  }

  private signSuperAdminTotpToken(userId: string): string {
    return this.jwtService.sign(
      { purpose: SUPER_ADMIN_TOTP_PURPOSE, userId },
      { expiresIn: SUPER_ADMIN_TOTP_TOKEN_TTL },
    );
  }

  private decodeSuperAdminTotpToken(token: string): SuperAdminTotpTokenPayload {
    let payload: SuperAdminTotpTokenPayload;
    try {
      payload = this.jwtService.verify<SuperAdminTotpTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // No `sub` claim on this token shape, same reasoning as the Google
    // pending token — never mistakable for a normal access token.
    if (payload?.purpose !== SUPER_ADMIN_TOTP_PURPOSE) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    return payload;
  }

  private generateRecoveryCodes(): string[] {
    return Array.from({ length: SUPER_ADMIN_RECOVERY_CODE_COUNT }, () => {
      const raw = randomBytes(6).toString('hex'); // 12 hex chars
      return raw.match(/.{1,4}/g)!.join('-'); // xxxx-xxxx-xxxx, easier to type once
    });
  }

  private async registerFailedTotpAttempt(user: User): Promise<void> {
    const attempts = user.totpFailedAttempts + 1;
    const lockedUntil =
      attempts >= SUPER_ADMIN_TOTP_MAX_FAILED_ATTEMPTS
        ? new Date(Date.now() + SUPER_ADMIN_TOTP_LOCKOUT_MINUTES * 60_000)
        : null;

    await this.prisma.user.update({
      where: { id: user.id },
      data: { totpFailedAttempts: attempts, totpLockedUntil: lockedUntil },
    });
  }

  private notifySuperAdminLogin(user: User, meta: SuperAdminLoginMeta): void {
    const details = [meta.ip ? `IP : ${meta.ip}` : null, meta.userAgent ? `Appareil : ${meta.userAgent}` : null]
      .filter(Boolean)
      .join(' — ');

    // Fire-and-forget, same stance as issueVerificationCode — never blocks
    // the login response, never a real send under NODE_ENV=test.
    this.emailChannel
      .send({
        to: user.email,
        subject: 'Nouvelle connexion Super Admin — Zen Events',
        text:
          `Une connexion Super Admin vient de réussir sur votre compte (${new Date().toISOString()}).` +
          (details ? ` ${details}.` : '') +
          ' Si ce n\'était pas vous, changez votre mot de passe immédiatement.',
      })
      .catch((error) => {
        this.logger.error(
          `Failed to send super admin login notification to ${user.email}: ${(error as Error).message}`,
        );
      });
  }
}
