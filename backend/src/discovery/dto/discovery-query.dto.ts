import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class DiscoveryQueryDto {
  // A carousel never needs hundreds of results — kept small by default,
  // overridable per docs/SPEC.md §9 ("limite par défaut raisonnable par
  // section, overridable en query param").
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
