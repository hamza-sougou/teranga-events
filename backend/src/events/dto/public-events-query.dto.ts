import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class PublicEventsQueryDto {
  @IsOptional()
  @IsString()
  category?: string;

  // Matches event name OR description, case-insensitive — same box as
  // PublicNavbarCategories/HomeHero's search field.
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
