import { Matches } from 'class-validator';

export class VerifyPhoneDto {
  @Matches(/^\d{6}$/, { message: 'code must be exactly 6 digits' })
  code!: string;
}
