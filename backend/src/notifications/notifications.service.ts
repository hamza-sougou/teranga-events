import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MemberStatus, NotificationChannel, NotificationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailChannel } from './channels/email.channel';
import { SmsChannel } from './channels/sms.channel';

const DISPATCH_BATCH_SIZE = 50;

interface RenderedMessage {
  to: string;
  subject: string;
  text: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailChannel: EmailChannel,
    private readonly smsChannel: SmsChannel,
    private readonly configService: ConfigService,
  ) {}

  async notifyOrderConfirmation(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return;

    await this.prisma.notification.create({
      data: {
        orderId,
        userId: order.buyerUserId,
        channel: NotificationChannel.EMAIL,
        type: 'order_confirmation',
      },
    });
  }

  async notifyEventCancelled(eventId: string): Promise<void> {
    const paidOrders = await this.prisma.order.findMany({ where: { eventId, status: 'PAID' } });
    if (paidOrders.length === 0) return;

    await this.prisma.notification.createMany({
      data: paidOrders.map((order) => ({
        orderId: order.id,
        userId: order.buyerUserId,
        channel: NotificationChannel.EMAIL,
        type: 'cancellation',
      })),
    });
  }

  async notifyTeamInvitation(membershipId: string): Promise<void> {
    const membership = await this.prisma.organizationMember.findUnique({ where: { id: membershipId } });
    if (!membership) return;

    await this.prisma.notification.create({
      data: {
        userId: membership.userId,
        channel: NotificationChannel.EMAIL,
        type: 'team_invitation',
      },
    });
  }

  // Called by NotificationsDispatchJob. Content is rendered here, not at
  // creation time — notifications rows only carry type + FKs, so this
  // re-resolves whatever context each type needs. One failure never blocks
  // the rest of the batch.
  async sendPendingNotifications(): Promise<void> {
    const pending = await this.prisma.notification.findMany({
      where: { status: NotificationStatus.PENDING },
      take: DISPATCH_BATCH_SIZE,
      orderBy: { createdAt: 'asc' },
    });

    for (const notification of pending) {
      try {
        const message = await this.renderMessage(notification.type, notification.orderId, notification.userId);
        if (!message) {
          await this.markFailed(notification.id);
          continue;
        }

        if (notification.channel === NotificationChannel.EMAIL) {
          await this.emailChannel.send(message);
        } else if (notification.channel === NotificationChannel.SMS) {
          await this.smsChannel.send(message);
        }

        await this.prisma.notification.update({
          where: { id: notification.id },
          data: { status: NotificationStatus.SENT, sentAt: new Date() },
        });
      } catch (error) {
        this.logger.error(`Failed to send notification ${notification.id}: ${(error as Error).message}`);
        await this.markFailed(notification.id);
      }
    }
  }

  private markFailed(notificationId: string) {
    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { status: NotificationStatus.FAILED },
    });
  }

  private async renderMessage(
    type: string,
    orderId: string | null,
    userId: string | null,
  ): Promise<RenderedMessage | null> {
    const frontendUrl = this.configService.get<string>('frontendUrl');

    if (type === 'order_confirmation' || type === 'cancellation' || type === 'event_reminder') {
      if (!orderId) return null;
      const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { event: true } });
      if (!order) return null;

      if (type === 'order_confirmation') {
        return {
          to: order.buyerEmail,
          subject: `Confirmation de votre commande — ${order.event.name}`,
          text: `Votre paiement a été confirmé pour "${order.event.name}". Retrouvez vos billets ici : ${frontendUrl}/orders/${order.id}`,
        };
      }

      if (type === 'cancellation') {
        return {
          to: order.buyerEmail,
          subject: `${order.event.name} a été annulé`,
          text: `L'évènement "${order.event.name}" a été annulé par l'organisateur. Contactez l'organisateur pour les modalités de remboursement. Référence commande : ${order.id}`,
        };
      }

      return {
        to: order.buyerEmail,
        subject: `Rappel — ${order.event.name} approche`,
        text: `"${order.event.name}" a lieu bientôt (${order.event.startAt.toLocaleString('fr-FR')}). Retrouvez vos billets ici : ${frontendUrl}/orders/${order.id}`,
      };
    }

    if (type === 'team_invitation') {
      if (!userId) return null;
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) return null;

      // Notifications rows have no generic metadata column to carry which
      // organization/role this was for — best-effort personalization via
      // the invitee's most recent still-pending membership, falling back
      // to a generic message if it was already accepted/declined by the
      // time this dispatches (or is otherwise ambiguous).
      const membership = await this.prisma.organizationMember.findFirst({
        where: { userId, status: MemberStatus.PENDING },
        orderBy: { createdAt: 'desc' },
        include: { organization: true },
      });
      const context = membership
        ? ` pour rejoindre "${membership.organization.name}" en tant que ${membership.role.toLowerCase()}`
        : '';

      return {
        to: user.email,
        subject: 'Invitation à rejoindre une équipe sur Zen Events',
        text: `Vous avez été invité(e)${context} sur Zen Events. Connectez-vous avec Google avec cette adresse (${user.email}) pour l'accepter.`,
      };
    }

    return null;
  }
}
