import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { CreateTicketTypeDto } from './dto/create-ticket-type.dto';
import { UpdateTicketTypeDto } from './dto/update-ticket-type.dto';
import { AddWhitelistEntriesDto } from './dto/add-whitelist-entries.dto';

@Injectable()
export class TicketTypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService,
  ) {}

  async create(organizationId: string, eventId: string, dto: CreateTicketTypeDto) {
    await this.eventsService.findOneForOrganization(organizationId, eventId);
    this.assertSaleWindow(dto.saleStart, dto.saleEnd);

    return this.prisma.ticketType.create({
      data: {
        eventId,
        name: dto.name,
        category: dto.category,
        price: dto.price,
        currency: dto.currency,
        quantityTotal: dto.quantityTotal,
        maxPerOrder: dto.maxPerOrder,
        accessMode: dto.accessMode,
        saleStart: new Date(dto.saleStart),
        saleEnd: new Date(dto.saleEnd),
      },
    });
  }

  async findAllForEvent(organizationId: string, eventId: string) {
    await this.eventsService.findOneForOrganization(organizationId, eventId);
    return this.prisma.ticketType.findMany({ where: { eventId } });
  }

  async findOneForEvent(organizationId: string, eventId: string, ticketTypeId: string) {
    await this.eventsService.findOneForOrganization(organizationId, eventId);
    const ticketType = await this.prisma.ticketType.findFirst({
      where: { id: ticketTypeId, eventId },
    });
    if (!ticketType) {
      throw new NotFoundException('Ticket type not found');
    }
    return ticketType;
  }

  async update(organizationId: string, eventId: string, ticketTypeId: string, dto: UpdateTicketTypeDto) {
    const ticketType = await this.findOneForEvent(organizationId, eventId, ticketTypeId);

    const saleStart = dto.saleStart ?? ticketType.saleStart.toISOString();
    const saleEnd = dto.saleEnd ?? ticketType.saleEnd.toISOString();
    this.assertSaleWindow(saleStart, saleEnd);

    if (dto.quantityTotal !== undefined && dto.quantityTotal < ticketType.quantitySold) {
      throw new BadRequestException(
        `quantityTotal (${dto.quantityTotal}) cannot be lower than quantitySold (${ticketType.quantitySold})`,
      );
    }

    return this.prisma.ticketType.update({
      where: { id: ticketTypeId },
      data: {
        name: dto.name,
        category: dto.category,
        price: dto.price,
        currency: dto.currency,
        quantityTotal: dto.quantityTotal,
        maxPerOrder: dto.maxPerOrder,
        accessMode: dto.accessMode,
        saleStart: dto.saleStart ? new Date(dto.saleStart) : undefined,
        saleEnd: dto.saleEnd ? new Date(dto.saleEnd) : undefined,
      },
    });
  }

  async listWhitelist(organizationId: string, eventId: string, ticketTypeId: string) {
    await this.findOneForEvent(organizationId, eventId, ticketTypeId);
    return this.prisma.ticketTypeWhitelist.findMany({ where: { ticketTypeId } });
  }

  async addWhitelistEntries(
    organizationId: string,
    eventId: string,
    ticketTypeId: string,
    dto: AddWhitelistEntriesDto,
  ) {
    await this.findOneForEvent(organizationId, eventId, ticketTypeId);
    await this.prisma.ticketTypeWhitelist.createMany({
      data: dto.emails.map((email) => ({ ticketTypeId, email })),
      skipDuplicates: true,
    });
    return this.listWhitelist(organizationId, eventId, ticketTypeId);
  }

  async removeWhitelistEntry(organizationId: string, eventId: string, ticketTypeId: string, email: string) {
    await this.findOneForEvent(organizationId, eventId, ticketTypeId);
    try {
      await this.prisma.ticketTypeWhitelist.delete({
        where: { ticketTypeId_email: { ticketTypeId, email } },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('Whitelist entry not found');
      }
      throw error;
    }
  }

  async findPublicForEvent(slug: string) {
    const event = await this.eventsService.findPublicBySlug(slug);
    const ticketTypes = await this.prisma.ticketType.findMany({
      where: { eventId: event.id },
      orderBy: { createdAt: 'asc' },
    });

    const now = new Date();
    return ticketTypes.map((ticketType) => ({
      id: ticketType.id,
      name: ticketType.name,
      category: ticketType.category,
      price: ticketType.price,
      currency: ticketType.currency,
      maxPerOrder: ticketType.maxPerOrder,
      accessMode: ticketType.accessMode,
      saleStart: ticketType.saleStart,
      saleEnd: ticketType.saleEnd,
      available: ticketType.quantityTotal - ticketType.quantitySold,
      isOnSale: now >= ticketType.saleStart && now <= ticketType.saleEnd,
    }));
  }

  private assertSaleWindow(saleStart: string, saleEnd: string) {
    if (new Date(saleEnd).getTime() <= new Date(saleStart).getTime()) {
      throw new BadRequestException('saleEnd must be after saleStart');
    }
  }
}
