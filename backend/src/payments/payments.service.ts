import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CinetpayProvider } from './providers/cinetpay.provider';
import { PaydunyaProvider } from './providers/paydunya.provider';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cinetpayProvider: CinetpayProvider,
    private readonly paydunyaProvider: PaydunyaProvider,
  ) {}
}
