import { MemberRole, MemberStatus } from '@prisma/client';
import { IsIn, IsOptional } from 'class-validator';

const ASSIGNABLE_ROLES = [
  MemberRole.CO_ORGANIZER,
  MemberRole.SELLER,
  MemberRole.CONTROLLER,
  MemberRole.ACCOUNTANT,
] as const;

const ASSIGNABLE_STATUSES = [MemberStatus.ACTIVE, MemberStatus.SUSPENDED] as const;

export class UpdateMemberDto {
  @IsOptional()
  @IsIn(ASSIGNABLE_ROLES)
  role?: MemberRole;

  @IsOptional()
  @IsIn(ASSIGNABLE_STATUSES)
  status?: MemberStatus;
}
