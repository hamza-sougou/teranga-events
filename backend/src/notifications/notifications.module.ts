import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { EmailChannel } from './channels/email.channel';
import { SmsChannel } from './channels/sms.channel';
import { NotificationsDispatchJob } from './notifications-dispatch.job';
import { EventReminderJob } from './event-reminder.job';

@Module({
  providers: [NotificationsService, EmailChannel, SmsChannel, NotificationsDispatchJob, EventReminderJob],
  exports: [NotificationsService],
})
export class NotificationsModule {}
