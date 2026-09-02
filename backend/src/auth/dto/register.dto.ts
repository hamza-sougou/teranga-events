import { Equals, IsBoolean, IsEmail, Matches, MinLength, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';
import {
  normalizeSenegalPhone,
  SENEGAL_PHONE_INPUT_MESSAGE,
  SENEGAL_PHONE_INPUT_REGEX,
} from '../../organizations/dto/phone.validator';
import { ExactlyOneIdentifier } from './identifier.validator';

@ExactlyOneIdentifier()
export class RegisterDto {
  @ValidateIf((dto: RegisterDto) => dto.email !== undefined)
  @IsEmail()
  email?: string;

  @ValidateIf((dto: RegisterDto) => dto.phone !== undefined)
  @Matches(SENEGAL_PHONE_INPUT_REGEX, { message: SENEGAL_PHONE_INPUT_MESSAGE })
  @Transform(({ value }) => (typeof value === 'string' ? normalizeSenegalPhone(value) : value))
  phone?: string;

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
