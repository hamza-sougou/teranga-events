import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { EmailChannel } from './channels/email.channel';
import { SmsChannel } from './channels/sms.channel';

@Module({
  providers: [NotificationsService, EmailChannel, SmsChannel],
  exports: [NotificationsService],
})
export class NotificationsModule {}
