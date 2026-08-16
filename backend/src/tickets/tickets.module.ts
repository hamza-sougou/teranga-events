import { Module } from '@nestjs/common';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { QrcodeService } from './qrcode.service';

@Module({
  controllers: [TicketsController],
  providers: [TicketsService, QrcodeService],
  exports: [TicketsService],
})
export class TicketsModule {}
