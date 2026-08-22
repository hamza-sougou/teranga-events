import { Module } from '@nestjs/common';
import { EventMediaController } from './event-media.controller';
import { EventMediaService } from './event-media.service';
import { EventsModule } from '../events/events.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [EventsModule, StorageModule],
  controllers: [EventMediaController],
  providers: [EventMediaService],
  exports: [EventMediaService],
})
export class EventMediaModule {}
