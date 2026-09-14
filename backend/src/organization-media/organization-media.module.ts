import { Module } from '@nestjs/common';
import { OrganizationMediaController } from './organization-media.controller';
import { OrganizationMediaService } from './organization-media.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  controllers: [OrganizationMediaController],
  providers: [OrganizationMediaService],
})
export class OrganizationMediaModule {}
