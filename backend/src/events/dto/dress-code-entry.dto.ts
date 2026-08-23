import { DressCodeAudience } from '@prisma/client';
import { IsEnum, IsOptional, MaxLength, MinLength } from 'class-validator';

export class DressCodeEntryDto {
  @MinLength(1)
  @MaxLength(25)
  label!: string;

  // Defaults to EVERYONE in EventsService when omitted — kept optional here
  // rather than defaulted in the DTO so the default lives in one place.
  @IsOptional()
  @IsEnum(DressCodeAudience)
  appliesTo?: DressCodeAudience;
}
