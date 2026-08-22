import { IsString, MinLength } from 'class-validator';

export class SearchPlacesQueryDto {
  @IsString()
  @MinLength(2, { message: 'q must be at least 2 characters' })
  q!: string;
}
