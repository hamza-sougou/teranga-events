import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AdminCancelEventDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
