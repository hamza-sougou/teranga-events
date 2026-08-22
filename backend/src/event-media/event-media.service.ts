import { randomUUID } from 'crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Event, EventMediaType, EventStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { R2Provider } from '../storage/providers/r2.provider';
import { PresignEventMediaDto } from './dto/presign-event-media.dto';
import { ConfirmEventMediaDto } from './dto/confirm-event-media.dto';
import { MEDIA_LIMITS, MIME_TO_EXTENSION } from './event-media.constants';

@Injectable()
export class EventMediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService,
    private readonly r2: R2Provider,
  ) {}

  async presign(organizationId: string, eventId: string, dto: PresignEventMediaDto) {
    const event = await this.eventsService.findOneForOrganization(organizationId, eventId);
    this.assertNotLocked(event);
    this.validateAgainstLimits(dto.type, dto.mimeType, dto.sizeBytes);
    // Early rejection for UX only — two concurrent presign requests could
    // both pass this check; the authoritative count check happens in
    // confirm(), right before the row is actually created.
    await this.assertUnderCount(eventId, dto.type);

    const extension = MIME_TO_EXTENSION[dto.mimeType];
    const storageKey = `events/${eventId}/${randomUUID()}.${extension}`;
    const uploadUrl = await this.r2.getPresignedUploadUrl({
      key: storageKey,
      contentType: dto.mimeType,
      contentLength: dto.sizeBytes,
    });

    return { uploadUrl, storageKey, publicUrl: this.r2.buildPublicUrl(storageKey) };
  }

  async confirm(organizationId: string, eventId: string, dto: ConfirmEventMediaDto) {
    const event = await this.eventsService.findOneForOrganization(organizationId, eventId);
    this.assertNotLocked(event);
    this.validateAgainstLimits(dto.type, dto.mimeType, dto.sizeBytes);
    await this.assertUnderCount(eventId, dto.type);

    // Never trust the client-declared size/type alone — re-verify against
    // what R2 actually stored, same "server always re-validates" philosophy
    // as the PayDunya IPN hash re-check.
    const head = await this.r2.headObject(dto.storageKey);
    if (!head || head.sizeBytes !== dto.sizeBytes) {
      throw new BadRequestException('Uploaded object not found or size mismatch');
    }

    return this.prisma.eventMedia.create({
      data: {
        eventId,
        type: dto.type,
        storageKey: dto.storageKey,
        url: this.r2.buildPublicUrl(dto.storageKey),
        mimeType: dto.mimeType,
        sizeBytes: dto.sizeBytes,
        originalFilename: dto.originalFilename,
      },
    });
  }

  async findAllForEvent(organizationId: string, eventId: string) {
    await this.eventsService.findOneForOrganization(organizationId, eventId);
    return this.prisma.eventMedia.findMany({ where: { eventId }, orderBy: { createdAt: 'asc' } });
  }

  async remove(organizationId: string, eventId: string, mediaId: string) {
    const event = await this.eventsService.findOneForOrganization(organizationId, eventId);
    this.assertNotLocked(event);

    const media = await this.prisma.eventMedia.findFirst({ where: { id: mediaId, eventId } });
    if (!media) {
      throw new NotFoundException('Media not found');
    }

    // R2 delete before DB delete: an orphaned R2 object (storage leak) is
    // invisible; an orphaned DB row pointing at a deleted object breaks a
    // live image/video. If the R2 call throws, the DB row stays intact and
    // the client can retry.
    await this.r2.deleteObject(media.storageKey);
    return this.prisma.eventMedia.delete({ where: { id: mediaId } });
  }

  private assertNotLocked(event: Event) {
    if (event.status === EventStatus.CANCELLED || event.status === EventStatus.COMPLETED) {
      throw new BadRequestException('Cannot modify media on a cancelled or completed event');
    }
  }

  private validateAgainstLimits(type: EventMediaType, mimeType: string, sizeBytes: number) {
    const limits = MEDIA_LIMITS[type];
    if (!limits.allowedMimeTypes.includes(mimeType)) {
      throw new BadRequestException(`Unsupported mime type for ${type}: ${mimeType}`);
    }
    if (sizeBytes > limits.maxSizeBytes) {
      throw new BadRequestException(`File exceeds the max size allowed for ${type}`);
    }
  }

  private async assertUnderCount(eventId: string, type: EventMediaType) {
    const count = await this.prisma.eventMedia.count({ where: { eventId, type } });
    if (count >= MEDIA_LIMITS[type].maxCount) {
      throw new BadRequestException(`Max ${type.toLowerCase()} count reached for this event`);
    }
  }
}
