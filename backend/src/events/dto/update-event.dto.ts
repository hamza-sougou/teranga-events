import { PartialType } from '@nestjs/swagger';
import { EventStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { CreateEventDto } from './create-event.dto';

export class UpdateEventDto extends PartialType(CreateEventDto) {
  @IsOptional()
  @IsEnum(EventStatus)
  status?: EventStatus;
}
