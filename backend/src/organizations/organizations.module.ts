import { Module } from '@nestjs/common';
import { OrganizationsController, OrganizationsCollectionController } from './organizations.controller';
import { AdminOrganizationsController } from './admin-organizations.controller';
import { OrganizationsService } from './organizations.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [OrganizationsController, OrganizationsCollectionController, AdminOrganizationsController],
  providers: [OrganizationsService],
})
export class OrganizationsModule {}
