import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EventStatus, OrderStatus, Prisma, TicketAccessMode, TicketStatus, TicketType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TicketsService } from '../tickets/tickets.service';
import { PricingService } from '../payments/pricing/pricing.service';
import { PaydunyaProvider } from '../payments/providers/paydunya.provider';
import { PreviewOrderDto } from './dto/preview-order.dto';
import { CheckoutDto } from './dto/checkout.dto';
import { OrderItemDto } from './dto/order-item.dto';

interface ResolvedItem {
  ticketType: TicketType;
  quantity: number;
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ticketsService: TicketsService,
    private readonly pricingService: PricingService,
    private readonly paydunyaProvider: PaydunyaProvider,
    private readonly configService: ConfigService,
  ) {}

  async preview(dto: PreviewOrderDto) {
    const { subtotalAmount } = await this.validateAndResolveItems(dto.eventId, dto.items);
    return { currency: 'XOF', ...this.pricingService.quoteCheckout(subtotalAmount, dto.paymentChannel) };
  }

  async checkout(dto: CheckoutDto) {
    const { event, resolvedItems, subtotalAmount } = await this.validateAndResolveItems(
      dto.eventId,
      dto.items,
      dto.buyerEmail,
    );
    const quote = this.pricingService.quoteCheckout(subtotalAmount, dto.paymentChannel);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    let order;
    try {
      order = await this.prisma.$transaction(async (tx) => {
        const created = await tx.order.create({
          data: {
            eventId: dto.eventId,
            buyerEmail: dto.buyerEmail,
            buyerPhone: dto.buyerPhone,
            status: OrderStatus.PENDING,
            subtotalAmount: quote.subtotalAmount,
            serviceFeeAmount: quote.serviceFeeAmount,
            totalAmount: quote.totalAmount,
            expiresAt,
          },
        });

        for (const item of resolvedItems) {
          const unitPrice = Number(item.ticketType.price);
          const orderItem = await tx.orderItem.create({
            data: {
              orderId: created.id,
              ticketTypeId: item.ticketType.id,
              quantity: item.quantity,
              unitPrice,
              subtotal: unitPrice * item.quantity,
            },
          });

          for (let i = 0; i < item.quantity; i++) {
            await tx.ticket.create({
              data: {
                orderItemId: orderItem.id,
                ticketTypeId: item.ticketType.id,
                qrToken: this.ticketsService.generateQrToken(),
              },
            });
          }
        }

        return created;
      });
    } catch (error) {
      // fn_reserve_ticket_capacity raises a plain Postgres exception (not a
      // Prisma known-request error) when a type's quota runs out mid-loop —
      // the whole transaction rolls back, no partial cart survives.
      if (error instanceof Prisma.PrismaClientUnknownRequestError && error.message.includes('Quota épuisé')) {
        throw new ConflictException('Some tickets are no longer available');
      }
      throw error;
    }

    try {
      const invoice = await this.paydunyaProvider.createInvoice({
        totalAmount: quote.totalAmount,
        description: `Zen Events — ${event.name}`,
        items: resolvedItems.map((item) => ({
          name: item.ticketType.name,
          quantity: item.quantity,
          unitPrice: Number(item.ticketType.price),
          totalPrice: Number(item.ticketType.price) * item.quantity,
        })),
        callbackUrl: this.configService.get<string>('paydunya.callbackUrl') ?? '',
        returnUrl: `${this.configService.get<string>('frontendUrl')}/orders/${order.id}`,
        cancelUrl: `${this.configService.get<string>('frontendUrl')}/orders/${order.id}`,
        customData: { orderId: order.id },
      });

      await this.prisma.payment.create({
        data: {
          orderId: order.id,
          provider: 'PAYDUNYA',
          providerTransactionId: invoice.token,
          amount: quote.totalAmount,
          status: 'PENDING',
        },
      });

      return {
        orderId: order.id,
        paymentUrl: invoice.paymentUrl,
        expiresAt: order.expiresAt,
        totalAmount: quote.totalAmount,
      };
    } catch (error) {
      await this.cancelOrphanedOrder(order.id);
      throw new ServiceUnavailableException('Unable to initiate payment, please try again');
    }
  }

  async findPublicById(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { ticketType: true, tickets: true } } },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const items = await Promise.all(
      order.items.map(async (item) => ({
        ticketTypeId: item.ticketTypeId,
        ticketTypeName: item.ticketType.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        tickets: await Promise.all(
          item.tickets
            .filter((ticket) => ticket.status === TicketStatus.VALID)
            .map(async (ticket) => ({
              id: ticket.id,
              status: ticket.status,
              qrCode: await this.ticketsService.renderQrImage(ticket.qrToken),
            })),
        ),
      })),
    );

    return {
      id: order.id,
      status: order.status,
      subtotalAmount: order.subtotalAmount,
      serviceFeeAmount: order.serviceFeeAmount,
      totalAmount: order.totalAmount,
      currency: order.currency,
      expiresAt: order.expiresAt,
      items,
    };
  }

  async findAllForEvent(organizationId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({ where: { id: eventId, organizationId } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    return this.prisma.order.findMany({
      where: { eventId },
      include: { items: { include: { ticketType: { select: { id: true, name: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async cancelOrphanedOrder(orderId: string) {
    await this.prisma.order.update({ where: { id: orderId }, data: { status: OrderStatus.CANCELLED } });
    await this.prisma.ticket.updateMany({
      where: { status: TicketStatus.PENDING_PAYMENT, orderItem: { orderId } },
      data: { status: TicketStatus.CANCELLED },
    });
  }

  // Shared by preview() and checkout() — preview omits buyerEmail, so the
  // presale whitelist gate is only enforced once an email is actually known
  // (i.e. at checkout, not on a price estimate).
  private async validateAndResolveItems(
    eventId: string,
    items: OrderItemDto[],
    buyerEmail?: string,
  ): Promise<{ event: { id: string; name: string }; resolvedItems: ResolvedItem[]; subtotalAmount: number }> {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event || event.status !== EventStatus.PUBLISHED) {
      throw new NotFoundException('Event not found');
    }

    const ticketTypes = await this.prisma.ticketType.findMany({
      where: { id: { in: items.map((item) => item.ticketTypeId) }, eventId },
    });
    const ticketTypeById = new Map(ticketTypes.map((ticketType) => [ticketType.id, ticketType]));

    const now = new Date();
    let subtotalAmount = 0;
    const resolvedItems: ResolvedItem[] = [];

    for (const item of items) {
      const ticketType = ticketTypeById.get(item.ticketTypeId);
      if (!ticketType) {
        throw new NotFoundException(`Ticket type ${item.ticketTypeId} not found for this event`);
      }
      if (now < ticketType.saleStart || now > ticketType.saleEnd) {
        throw new BadRequestException(`Ticket type "${ticketType.name}" is not currently on sale`);
      }
      if (item.quantity > ticketType.maxPerOrder) {
        throw new BadRequestException(
          `Quantity for "${ticketType.name}" exceeds the maximum per order (${ticketType.maxPerOrder})`,
        );
      }
      if (ticketType.accessMode === TicketAccessMode.PRESALE_WHITELIST && buyerEmail) {
        const whitelisted = await this.prisma.ticketTypeWhitelist.findUnique({
          where: { ticketTypeId_email: { ticketTypeId: ticketType.id, email: buyerEmail } },
        });
        if (!whitelisted) {
          throw new ForbiddenException(`${buyerEmail} is not whitelisted for "${ticketType.name}"`);
        }
      }

      subtotalAmount += Number(ticketType.price) * item.quantity;
      resolvedItems.push({ ticketType, quantity: item.quantity });
    }

    return { event, resolvedItems, subtotalAmount };
  }
}
