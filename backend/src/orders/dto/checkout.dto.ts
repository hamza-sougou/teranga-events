import { IsEmail, IsOptional, IsString } from 'class-validator';
import { PreviewOrderDto } from './preview-order.dto';

export class CheckoutDto extends PreviewOrderDto {
  @IsEmail()
  buyerEmail!: string;

  @IsOptional()
  @IsString()
  buyerPhone?: string;
}
