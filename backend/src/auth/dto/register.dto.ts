import { Equals, IsBoolean, IsEmail, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @MinLength(8)
  password!: string;

  @MinLength(8)
  passwordConfirmation!: string;

  @MinLength(2)
  fullName!: string;

  @IsBoolean()
  marketingOptIn!: boolean;

  // Must be explicitly true — registering without accepting terms is rejected
  // by validation itself, not left to the service layer to check.
  @Equals(true, { message: 'Terms of service must be accepted' })
  termsAccepted!: boolean;
}
