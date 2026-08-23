import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { DressCodeEntryDto } from './dress-code-entry.dto';

export class CreateEventDto {
  @MinLength(2)
  name!: string;

  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug must contain only lowercase letters, digits and hyphens',
  })
  slug!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  venueName?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsDateString()
  startAt!: string;

  @IsDateString()
  endAt!: string;

  // Minimum age required, null = everyone. No separate "18+" field — that's
  // just minAge = 18, a frontend shortcut, not a distinct data structure.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(99)
  minAge?: number | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DressCodeEntryDto)
  dressCodes?: DressCodeEntryDto[];
}
