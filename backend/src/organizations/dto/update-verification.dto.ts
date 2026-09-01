import { IsBoolean } from 'class-validator';

export class UpdateVerificationDto {
  @IsBoolean()
  isVerified!: boolean;
}
