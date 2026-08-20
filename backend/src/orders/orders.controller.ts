import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { OrdersService } from './orders.service';
import { PreviewOrderDto } from './dto/preview-order.dto';
import { CheckoutDto } from './dto/checkout.dto';

// Public — no login required to buy a ticket. The order's own unguessable
// UUID is the de facto access token for GET, consistent with events/ticket-types.
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('preview')
  preview(@Body() dto: PreviewOrderDto) {
    return this.ordersService.preview(dto);
  }

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  checkout(@Body() dto: CheckoutDto) {
    return this.ordersService.checkout(dto);
  }

  @Get(':orderId')
  findPublicById(@Param('orderId') orderId: string) {
    return this.ordersService.findPublicById(orderId);
  }
}
