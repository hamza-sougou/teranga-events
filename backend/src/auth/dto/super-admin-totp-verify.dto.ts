import { IsNotEmpty, IsString } from 'class-validator';

export class SuperAdminTotpVerifyDto {
  @IsString()
  @IsNotEmpty()
  totpToken!: string;

  // Either a 6-digit TOTP code or a one-time recovery code — deliberately
  // not @Matches(/^\d{6}$/) like VerifyEmailDto, since recovery codes must
  // pass DTO validation too. AuthService disambiguates by shape.
  @IsString()
  @IsNotEmpty()
  code!: string;
}
