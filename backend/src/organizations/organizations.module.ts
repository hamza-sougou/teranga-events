import { Module } from '@nestjs/common';
import { OrganizationsController } from './organizations.controller';
import { AdminOrganizationsController } from './admin-organizations.controller';
import { OrganizationsService } from './organizations.service';

@Module({
  controllers: [OrganizationsController, AdminOrganizationsController],
  providers: [OrganizationsService],
})
export class OrganizationsModule {}
