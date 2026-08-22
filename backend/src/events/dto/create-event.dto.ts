import { IsDateString, IsLatitude, IsLongitude, IsOptional, IsString, IsUUID, Matches, MinLength } from 'class-validator';

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
}
