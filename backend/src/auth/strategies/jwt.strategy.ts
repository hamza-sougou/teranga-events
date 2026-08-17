import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  isSuperAdmin: boolean;
  isActive: boolean;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret'),
    });
  }

  // Re-fetches the user on every request rather than trusting the JWT
  // payload, so a deactivated account is rejected immediately instead of
  // staying valid until the token expires (see CLAUDE.md module plan).
  async validate(payload: { sub: string }): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });

    if (!user || !user.isActive) {
      throw new UnauthorizedException();
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      isSuperAdmin: user.isSuperAdmin,
      isActive: user.isActive,
    };
  }
}
