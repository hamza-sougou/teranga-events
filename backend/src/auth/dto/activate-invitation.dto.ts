import { IsEmail, Matches, MinLength, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';
import {
  normalizeSenegalPhone,
  SENEGAL_PHONE_INPUT_MESSAGE,
  SENEGAL_PHONE_INPUT_REGEX,
} from '../../organizations/dto/phone.validator';
import { ExactlyOneIdentifier } from './identifier.validator';

// Public endpoint (no session yet) — identifies the placeholder account by
// whichever identifier the invitation used, same "exactly one of email/phone"
// contract as RegisterDto/LoginDto/InviteMemberDto.
@ExactlyOneIdentifier()
export class ActivateInvitationDto {
  @ValidateIf((dto: ActivateInvitationDto) => dto.email !== undefined)
  @IsEmail()
  email?: string;

  @ValidateIf((dto: ActivateInvitationDto) => dto.phone !== undefined)
  @Matches(SENEGAL_PHONE_INPUT_REGEX, { message: SENEGAL_PHONE_INPUT_MESSAGE })
  @Transform(({ value }) => (typeof value === 'string' ? normalizeSenegalPhone(value) : value))
  phone?: string;

  @Matches(/^\d{6}$/, { message: 'code must be exactly 6 digits' })
  code!: string;

  @MinLength(8)
  password!: string;

  @MinLength(8)
  passwordConfirmation!: string;
}
