import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { EventMediaType } from '@prisma/client';

export class ConfirmEventMediaDto {
  @IsEnum(EventMediaType)
  type!: EventMediaType;

  @IsString()
  storageKey!: string;

  @IsString()
  mimeType!: string;

  @IsInt()
  @Min(1)
  sizeBytes!: number;

  @IsOptional()
  @IsString()
  originalFilename?: string;
}
