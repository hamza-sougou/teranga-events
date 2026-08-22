import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EventCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  findAllActive() {
    return this.prisma.eventCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }
}
