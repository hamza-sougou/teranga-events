import { IsEnum, IsInt, IsString, Min, MinLength } from 'class-validator';
import { EventMediaType } from '@prisma/client';

export class PresignEventMediaDto {
  @IsEnum(EventMediaType)
  type!: EventMediaType;

  @IsString()
  @MinLength(1)
  filename!: string;

  @IsString()
  mimeType!: string;

  @IsInt()
  @Min(1)
  sizeBytes!: number;
}
