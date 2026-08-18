import { Type } from 'class-transformer';
import { ArrayMinSize, IsEnum, IsUUID, ValidateNested } from 'class-validator';
import { PaymentChannel } from '../../payments/pricing/payment-channel';
import { OrderItemDto } from './order-item.dto';

export class PreviewOrderDto {
  @IsUUID()
  eventId!: string;

  @IsEnum(PaymentChannel)
  paymentChannel!: PaymentChannel;

  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];
}
