import { IsNotEmpty, IsString } from 'class-validator';

export class SuperAdminTotpSetupDto {
  @IsString()
  @IsNotEmpty()
  totpToken!: string;
}
