import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ScanService {
  constructor(private readonly prisma: PrismaService) {}

  // Must stay a single conditional UPDATE ... WHERE status = 'valid'
  // RETURNING id (see CLAUDE.md "Critical business rules" — scan anti-fraud),
  // never a SELECT followed by a separate UPDATE.
}
