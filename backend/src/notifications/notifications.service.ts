import { Injectable } from '@nestjs/common';
import { EmailChannel } from './channels/email.channel';
import { SmsChannel } from './channels/sms.channel';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly emailChannel: EmailChannel,
    private readonly smsChannel: SmsChannel,
  ) {}
}
