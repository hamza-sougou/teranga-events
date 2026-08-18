import { IsInt, IsPositive, IsUUID } from 'class-validator';

export class OrderItemDto {
  @IsUUID()
  ticketTypeId!: string;

  @IsInt()
  @IsPositive()
  quantity!: number;
}
