import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TicketTypesService {
  constructor(private readonly prisma: PrismaService) {}
}
