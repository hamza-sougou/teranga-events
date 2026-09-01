import { EventStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

export class AdminEventsQueryDto {
  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @IsOptional()
  @IsEnum(EventStatus)
  status?: EventStatus;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  // Matches event name OR organization name, case-insensitive — one search
  // box is enough for a moderation list at this scale (docs/DESIGN_SYSTEM.md
  // "aéré"/simple preference already shown on the Team page).
  @IsOptional()
  @IsString()
  q?: string;
}
