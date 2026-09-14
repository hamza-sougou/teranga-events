import { Module } from '@nestjs/common';
import { OrganizationsController, OrganizationsCollectionController } from './organizations.controller';
import { AdminOrganizationsController } from './admin-organizations.controller';
import { PublicOrganizerController } from './public-organizer.controller';
import { UnsubscribeController } from './unsubscribe.controller';
import { OrganizationsService } from './organizations.service';
import { OrganizerProfileService } from './organizer-profile.service';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [AuthModule, NotificationsModule, PaymentsModule],
  controllers: [
    OrganizationsController,
    OrganizationsCollectionController,
    AdminOrganizationsController,
    PublicOrganizerController,
    UnsubscribeController,
  ],
  providers: [OrganizationsService, OrganizerProfileService],
})
export class OrganizationsModule {}
