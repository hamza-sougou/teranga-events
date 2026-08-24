import { randomBytes } from 'crypto';
import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { MemberRole, MemberStatus, Prisma, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

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

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const passwordHash = await bcrypt.hash(dto.password, 10);

    let user: User;
    try {
      user = await this.createOrganizerAccount({
        email: dto.email,
        fullName: dto.fullName,
        passwordHash,
        organizationName: dto.organizationName,
        organizationSlug: dto.organizationSlug,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Email or organization slug already in use');
      }
      throw error;
    }

    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto) {
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

    return this.buildAuthResponse(user);
  }

  async loginWithGoogle(profile: GoogleProfile) {
    const existing = await this.prisma.user.findFirst({
      where: { email: { equals: profile.email, mode: 'insensitive' } },
    });

    let user: User;
    if (existing) {
      if (!existing.isActive) {
        throw new UnauthorizedException('Account disabled');
      }
      // Google verifies the email, so linking to an existing password-based
      // account with the same address is safe.
      user = existing.googleId
        ? existing
        : await this.prisma.user.update({
            where: { id: existing.id },
            data: { googleId: profile.googleId },
          });
    } else {
      const firstName = profile.fullName.split(' ')[0] || profile.fullName;
      user = await this.createOrganizerAccount({
        email: profile.email,
        fullName: profile.fullName,
        googleId: profile.googleId,
        organizationName: `Organisation de ${firstName}`,
        organizationSlug: await this.generateUniqueOrganizationSlug(profile.fullName),
      });
    }

    return this.buildAuthResponse(user);
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

  private async createOrganizerAccount(data: {
    email: string;
    fullName: string;
    organizationName: string;
    organizationSlug: string;
    passwordHash?: string;
    googleId?: string;
  }): Promise<User> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: data.email,
          fullName: data.fullName,
          passwordHash: data.passwordHash,
          googleId: data.googleId,
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

  private buildAuthResponse(user: User) {
    const accessToken = this.jwtService.sign({ sub: user.id });
    return { accessToken, user: this.sanitizeUser(user) };
  }

  private sanitizeUser(user: User) {
    const { passwordHash, googleId, ...safeUser } = user;
    return safeUser;
  }
}
