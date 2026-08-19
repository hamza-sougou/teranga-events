import { createHash, timingSafeEqual } from 'crypto';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus, PaymentStatus, Prisma, TicketStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaydunyaProvider } from './providers/paydunya.provider';
import { NotificationsService } from '../notifications/notifications.service';

interface ParsedIpnPayload {
  hash?: string;
  token?: string;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paydunyaProvider: PaydunyaProvider,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // See docs/MODULE_PAIEMENT_SPEC.md §3-4. `rawBody` is the parsed
  // application/x-www-form-urlencoded POST body from PayDunya.
  async handlePaydunyaIpn(rawBody: Record<string, unknown>): Promise<void> {
    const { hash, token } = this.parseIpnPayload(rawBody);

    if (!this.verifyHash(hash)) {
      this.logger.warn(`Rejected PayDunya IPN with invalid hash (token candidate: ${token ?? 'unknown'})`);
      throw new BadRequestException('Invalid IPN signature');
    }

    if (!token) {
      this.logger.warn('PayDunya IPN authenticated but missing an invoice token');
      throw new BadRequestException('Missing invoice token');
    }

    const payment = await this.prisma.payment.findFirst({
      where: { providerTransactionId: token },
      include: { order: true },
    });
    if (!payment) {
      this.logger.warn(`PayDunya IPN for unknown invoice token ${token}`);
      throw new BadRequestException('Unknown transaction');
    }

    if (payment.status === PaymentStatus.SUCCESS) {
      return; // Duplicate IPN for an already-processed payment — no-op.
    }

    // Never trust the incoming payload's own status/amount fields for
    // business decisions — re-fetch the authoritative state directly from
    // PayDunya's servers using the token we just authenticated.
    const confirmed = await this.paydunyaProvider.confirmInvoice(token);

    if (confirmed.status !== 'completed') {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED, rawResponse: toJson(confirmed) },
      });
      return;
    }

    if (Math.round(confirmed.totalAmount) !== Number(payment.order.totalAmount)) {
      this.logger.error(
        `PayDunya amount mismatch for order ${payment.orderId}: expected ${payment.order.totalAmount}, got ${confirmed.totalAmount}`,
      );
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED, rawResponse: toJson({ ...confirmed, mismatch: true }) },
      });
      return;
    }

    // Atomic conditional UPDATE — same pattern as the scan anti-fraud rule
    // (CLAUDE.md). Two near-simultaneous IPNs for the same order: only one
    // affects a row here, the other finds 0 and exits without duplicating.
    const updatedOrders = await this.prisma.order.updateMany({
      where: { id: payment.orderId, status: OrderStatus.PENDING },
      data: { status: OrderStatus.PAID },
    });

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.SUCCESS, rawResponse: toJson(confirmed) },
    });

    if (updatedOrders.count === 0) {
      // Order wasn't PENDING anymore — either a concurrent IPN already won
      // the race (already PAID, nothing else to do), or the expiration job
      // beat us to it (EXPIRED) — a late webhook, flagged for manual review
      // rather than silently reviving the order.
      const currentOrder = await this.prisma.order.findUniqueOrThrow({ where: { id: payment.orderId } });
      if (currentOrder.status === OrderStatus.EXPIRED) {
        await this.prisma.auditLog.create({
          data: {
            action: 'payment.received_after_expiry',
            entityType: 'order',
            entityId: payment.orderId,
            metadata: toJson({ paymentId: payment.id, token }),
          },
        });
      }
      return;
    }

    await this.prisma.ticket.updateMany({
      where: { status: TicketStatus.PENDING_PAYMENT, orderItem: { orderId: payment.orderId } },
      data: { status: TicketStatus.VALID },
    });

    await this.notificationsService.notifyOrderConfirmation(payment.orderId);
  }

  private verifyHash(receivedHash: string | undefined): boolean {
    if (!receivedHash) return false;

    const masterKey = this.configService.get<string>('paydunya.masterKey') ?? '';
    const expected = createHash('sha512').update(masterKey).digest('hex');

    const expectedBuf = Buffer.from(expected, 'utf8');
    const receivedBuf = Buffer.from(receivedHash, 'utf8');
    if (expectedBuf.length !== receivedBuf.length) return false;

    return timingSafeEqual(expectedBuf, receivedBuf);
  }

  // PayDunya posts application/x-www-form-urlencoded with a `data` field
  // holding a JSON-encoded payload (docs/SPEC.md §5.4: `hash` + invoice
  // info). Exact field names beyond `hash` are inferred from the SDK's
  // CheckoutInvoice#confirm response shape (same underlying API) and kept
  // deliberately minimal — see docs/MODULE_PAIEMENT_SPEC.md §12.
  private parseIpnPayload(rawBody: Record<string, unknown>): ParsedIpnPayload {
    let data: Record<string, any> = rawBody;

    if (typeof rawBody.data === 'string') {
      try {
        data = JSON.parse(rawBody.data);
      } catch {
        data = {};
      }
    } else if (rawBody.data && typeof rawBody.data === 'object') {
      data = rawBody.data as Record<string, any>;
    }

    const token = data?.invoice?.token ?? data?.token;
    return { hash: data?.hash, token };
  }
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value));
}
