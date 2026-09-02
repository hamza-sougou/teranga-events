import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { EmailChannel } from './channels/email.channel';
import { SmsChannel } from './channels/sms.channel';
import { NotificationsDispatchJob } from './notifications-dispatch.job';
import { EventReminderJob } from './event-reminder.job';

@Module({
  providers: [NotificationsService, EmailChannel, SmsChannel, NotificationsDispatchJob, EventReminderJob],
  // EmailChannel/SmsChannel are also exported directly — AuthModule reuses
  // them for the email/phone verification codes rather than routing through
  // NotificationsService (which is built around the notifications table +
  // minute-cadence dispatch job, unsuitable latency for a 15-minute-lifetime
  // code).
  exports: [NotificationsService, EmailChannel, SmsChannel],
})
export class NotificationsModule {}
