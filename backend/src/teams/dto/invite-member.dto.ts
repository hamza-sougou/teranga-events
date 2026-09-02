import { MemberRole } from '@prisma/client';
import { IsEmail, IsIn, IsOptional, Matches, MinLength, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';
import {
  normalizeSenegalPhone,
  SENEGAL_PHONE_INPUT_MESSAGE,
  SENEGAL_PHONE_INPUT_REGEX,
} from '../../organizations/dto/phone.validator';
import { ExactlyOneIdentifier } from '../../auth/dto/identifier.validator';

const INVITABLE_ROLES = [
  MemberRole.CO_ORGANIZER,
  MemberRole.SELLER,
  MemberRole.CONTROLLER,
  MemberRole.ACCOUNTANT,
] as const;

// Same "exactly one of email/phone" contract as RegisterDto/LoginDto —
// ExactlyOneIdentifier is a class decorator specifically so it can be
// reused as-is here instead of re-implemented per DTO.
@ExactlyOneIdentifier()
export class InviteMemberDto {
  @ValidateIf((dto: InviteMemberDto) => dto.email !== undefined)
  @IsEmail()
  email?: string;

  @ValidateIf((dto: InviteMemberDto) => dto.phone !== undefined)
  @Matches(SENEGAL_PHONE_INPUT_REGEX, { message: SENEGAL_PHONE_INPUT_MESSAGE })
  @Transform(({ value }) => (typeof value === 'string' ? normalizeSenegalPhone(value) : value))
  phone?: string;

  @IsIn(INVITABLE_ROLES)
  role!: MemberRole;

  // Required only if the invited email/phone has no account yet — validated
  // in the service, since that depends on a DB lookup the DTO can't express.
  @IsOptional()
  @MinLength(2)
  fullName?: string;
}
