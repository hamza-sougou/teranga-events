import { Equals, IsBoolean, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class CompleteGoogleSignupDto {
  @IsString()
  @IsNotEmpty()
  pendingToken!: string;

  // Overrides the Google-provided display name if the person edits it on the
  // intermediate page; falls back to the token's fullName when omitted.
  @IsOptional()
  @MinLength(2)
  fullName?: string;

  @IsBoolean()
  marketingOptIn!: boolean;

  @Equals(true, { message: 'Terms of service must be accepted' })
  termsAccepted!: boolean;
}
