import { IsDateString, IsOptional, IsString, IsUUID, Matches, MinLength } from 'class-validator';

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
  @IsUUID()
  categoryId?: string;

  @IsDateString()
  startAt!: string;

  @IsDateString()
  endAt!: string;
}
