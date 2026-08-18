import { IsOptional, IsString, MinLength } from 'class-validator';

export class ScanTicketDto {
  @MinLength(1)
  qrToken!: string;

  @IsOptional()
  @IsString()
  gateOrZone?: string;

  @IsOptional()
  @IsString()
  deviceId?: string;
}
