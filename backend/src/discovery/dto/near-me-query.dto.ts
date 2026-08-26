import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude, IsOptional, IsPositive, Max } from 'class-validator';
import { DiscoveryQueryDto } from './discovery-query.dto';

export class NearMeQueryDto extends DiscoveryQueryDto {
  @Type(() => Number)
  @IsLatitude()
  lat!: number;

  @Type(() => Number)
  @IsLongitude()
  lng!: number;

  @IsOptional()
  @Type(() => Number)
  @IsPositive()
  @Max(500)
  radiusKm?: number;
}
