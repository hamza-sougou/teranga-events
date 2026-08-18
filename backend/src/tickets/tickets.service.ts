import { randomBytes } from 'crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QrcodeService } from './qrcode.service';

@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly qrcodeService: QrcodeService,
  ) {}

  // Never guessable, never the order/ticket UUID — see db/schema.sql
  // section 7 (tickets.qr_token) and docs/MODULE_PAIEMENT_SPEC.md §2.2.
  generateQrToken(): string {
    return randomBytes(24).toString('hex');
  }

  renderQrImage(qrToken: string): Promise<string> {
    return this.qrcodeService.generate(qrToken);
  }
}
