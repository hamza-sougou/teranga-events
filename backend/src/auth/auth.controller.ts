import { Controller, Get, Patch, Post, Body, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CompleteGoogleSignupDto } from './dto/complete-google-signup.dto';
import { GooglePendingTokenDto } from './dto/google-pending-token.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from './strategies/jwt.strategy';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.me(user.id);
  }

  @Patch('password')
  @UseGuards(JwtAuthGuard)
  changePassword(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.id, dto);
  }

  @Post('verify-email')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verifyEmail(@CurrentUser() user: AuthenticatedUser, @Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(user.id, dto);
  }

  @Post('verify-email/resend')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 3, ttl: 300_000 } })
  resendVerificationCode(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.resendVerificationCode(user.id);
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleLogin() {
    // Guard redirects to Google's consent screen; nothing to do here.
  }

  // Single callback for both "Log in with Google" and "Sign up with
  // Google" — the redirect fragment's `status` tells the frontend which of
  // the three outcomes happened, never sent as a query string so it never
  // lands in server access logs.
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  googleCallback(@Req() req: Request, @Res() res: Response) {
    const result = req.user as Awaited<ReturnType<AuthService['continueWithGoogle']>>;
    const frontendUrl = this.configService.get<string>('frontendUrl');

    if (result.status === 'signup_pending') {
      res.redirect(`${frontendUrl}/auth/callback#status=signup_pending&pendingToken=${result.pendingToken}`);
      return;
    }

    res.redirect(`${frontendUrl}/auth/callback#status=${result.status}&token=${result.accessToken}`);
  }

  @Post('google/pending')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  getGooglePendingSignup(@Body() dto: GooglePendingTokenDto) {
    return this.authService.getGooglePendingSignup(dto.token);
  }

  @Post('google/complete')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  completeGoogleSignup(@Body() dto: CompleteGoogleSignupDto) {
    return this.authService.completeGoogleSignup(dto);
  }
}
