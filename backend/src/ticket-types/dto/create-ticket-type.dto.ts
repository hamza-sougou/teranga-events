import { TicketAccessMode, TicketCategory } from '@prisma/client';
import { IsDateString, IsEnum, IsInt, IsOptional, IsPositive, Min, MinLength } from 'class-validator';

export class CreateTicketTypeDto {
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsEnum(TicketCategory)
  category?: TicketCategory;

  @Min(0)
  price!: number;

  @IsOptional()
  @MinLength(3)
  currency?: string;

  @IsInt()
  @IsPositive()
  quantityTotal!: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  maxPerOrder?: number;

  @IsOptional()
  @IsEnum(TicketAccessMode)
  accessMode?: TicketAccessMode;

  @IsDateString()
  saleStart!: string;

  @IsDateString()
  saleEnd!: string;
}
