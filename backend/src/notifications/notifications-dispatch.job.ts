import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationsService } from './notifications.service';

@Injectable()
export class NotificationsDispatchJob {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async dispatch() {
    await this.notificationsService.sendPendingNotifications();
  }
}
