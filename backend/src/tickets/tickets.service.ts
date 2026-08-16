import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QrcodeService } from './qrcode.service';

@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly qrcodeService: QrcodeService,
  ) {}
}
