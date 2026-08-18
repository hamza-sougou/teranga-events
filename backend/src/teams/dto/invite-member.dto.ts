import { MemberRole } from '@prisma/client';
import { IsEmail, IsIn, IsOptional, MinLength } from 'class-validator';

const INVITABLE_ROLES = [
  MemberRole.CO_ORGANIZER,
  MemberRole.SELLER,
  MemberRole.CONTROLLER,
  MemberRole.ACCOUNTANT,
] as const;

export class InviteMemberDto {
  @IsEmail()
  email!: string;

  @IsIn(INVITABLE_ROLES)
  role!: MemberRole;

  // Required only if `email` has no account yet — validated in the
  // service, since that depends on a DB lookup the DTO can't express.
  @IsOptional()
  @MinLength(2)
  fullName?: string;
}
