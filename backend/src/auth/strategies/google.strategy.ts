import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-google-oauth20';
import { AuthService } from '../auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private static readonly logger = new Logger(GoogleStrategy.name);

  constructor(
    configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    const clientID = configService.get<string>('google.clientId');
    const clientSecret = configService.get<string>('google.clientSecret');

    if (!clientID || !clientSecret) {
      GoogleStrategy.logger.warn(
        'GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET are not set — /auth/google will redirect to Google and fail there instead of working.',
      );
    }

    // passport-oauth2 throws synchronously if clientID/clientSecret are
    // falsy, which would crash app bootstrap entirely. Falling back to a
    // placeholder keeps the app (and classic email/password auth) usable
    // in environments where Google OAuth hasn't been configured yet.
    super({
      clientID: clientID || 'not-configured',
      clientSecret: clientSecret || 'not-configured',
      callbackURL: configService.get<string>('google.callbackUrl'),
      scope: ['email', 'profile'],
    });
  }

  async validate(_accessToken: string, _refreshToken: string, profile: Profile) {
    const email = profile.emails?.[0]?.value;
    const emailVerified = (profile._json as { email_verified?: boolean })?.email_verified;

    // Google-verified email is what makes it safe to auto-link this
    // identity to an existing password-based account by email.
    if (!email || emailVerified === false) {
      throw new UnauthorizedException('Google account email is not verified');
    }

    const fullName =
      profile.displayName ||
      [profile.name?.givenName, profile.name?.familyName].filter(Boolean).join(' ') ||
      email;

    return this.authService.loginWithGoogle({ googleId: profile.id, email, fullName });
  }
}
