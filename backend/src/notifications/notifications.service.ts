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

  // Fan-out to every OrganizerSubscription email when an organization
  // publishes an event — same createMany + cron-dispatch pattern as
  // notifyEventCancelled, so a popular organizer's publish request never
  // blocks on sending N emails synchronously.
  async notifyOrganizerSubscribers(organizationId: string, eventId: string): Promise<void> {
    const subscribers = await this.prisma.organizerSubscription.findMany({ where: { organizationId } });
    if (subscribers.length === 0) return;

    await this.prisma.notification.createMany({
      data: subscribers.map((subscriber) => ({
        eventId,
        organizerSubscriptionId: subscriber.id,
        channel: NotificationChannel.EMAIL,
        type: 'organizer_new_event',
      })),
    });
  }

  async notifyTeamInvitation(membershipId: string): Promise<void> {
    const membership = await this.prisma.organizationMember.findUnique({ where: { id: membershipId } });
    if (!membership) return;

    const user = await this.prisma.user.findUnique({ where: { id: membership.userId } });
    if (!user) return;

    // Phone-auth step 2/5 (PROGRESS.md): a phone-only invitee has no email
    // to reach — mirrors TeamsService's own "email if present, else phone"
    // channel choice for the immediate activation code.
    const channel = user.email ? NotificationChannel.EMAIL : NotificationChannel.SMS;
    if (channel === NotificationChannel.SMS && !user.phoneNumber) return;

    await this.prisma.notification.create({
      data: {
        userId: membership.userId,
        channel,
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
        const message = await this.renderMessage(
          notification.type,
          notification.orderId,
          notification.userId,
          notification.eventId,
          notification.organizerSubscriptionId,
        );
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
    eventId: string | null,
    organizerSubscriptionId: string | null,
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

      // A placeholder account (passwordSet: false) already got a separate,
      // immediate activation code from AuthService.issueInvitationActivationCode
      // — this (delayed, batch-dispatched) notification just points them at
      // it. A real account (passwordSet: true) already has a way in.
      const callToAction = user.passwordSet
        ? "Connectez-vous sur Zen Events pour l'accepter."
        : "Utilisez le code d'activation que nous venons de vous envoyer pour créer votre mot de passe et l'accepter.";

      if (user.email) {
        return {
          to: user.email,
          subject: 'Invitation à rejoindre une équipe sur Zen Events',
          text: `Vous avez été invité(e)${context} sur Zen Events. ${callToAction}`,
        };
      }

      if (user.phoneNumber) {
        return {
          to: user.phoneNumber,
          subject: 'Invitation à rejoindre une équipe sur Zen Events',
          text: `Zen Events : vous avez été invité(e)${context}. ${callToAction}`,
        };
      }

      return null;
    }

    if (type === 'organizer_new_event') {
      if (!eventId || !organizerSubscriptionId) return null;
      const [event, subscription] = await Promise.all([
        this.prisma.event.findUnique({ where: { id: eventId }, include: { organization: true } }),
        this.prisma.organizerSubscription.findUnique({ where: { id: organizerSubscriptionId } }),
      ]);
      // Either can be gone by dispatch time (event deleted, or the
      // subscription's own row already cascaded away on unsubscribe) —
      // treated the same as any other missing-context case: drop silently.
      if (!event || !subscription) return null;

      const unsubscribeUrl = `${frontendUrl}/unsubscribe?token=${subscription.id}`;
      return {
        to: subscription.email,
        subject: `${event.organization.name} vient de publier un nouvel évènement`,
        text: `"${event.name}" vient d'être publié par ${event.organization.name}. Voir l'évènement : ${frontendUrl}/events/${event.slug}\n\nNe plus recevoir ces emails : ${unsubscribeUrl}`,
      };
    }

    return null;
  }
}
