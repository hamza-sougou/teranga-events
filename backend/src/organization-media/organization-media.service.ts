import { randomUUID } from 'crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { R2Provider } from '../storage/providers/r2.provider';
import { MEDIA_LIMITS, MIME_TO_EXTENSION } from '../event-media/event-media.constants';
import { PROFILE_SELECT } from '../organizations/organizations.service';
import { PresignOrganizationMediaDto } from './dto/presign-organization-media.dto';
import { ConfirmOrganizationMediaDto } from './dto/confirm-organization-media.dto';
import { ORGANIZATION_MEDIA_TYPES, OrganizationMediaType } from './dto/presign-organization-media.dto';

const PREVIOUS_KEY_SELECT = { avatarStorageKey: true, coverStorageKey: true } as const;

@Injectable()
export class OrganizationMediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly r2: R2Provider,
  ) {}

  async presign(organizationId: string, dto: PresignOrganizationMediaDto) {
    this.validateAgainstLimits(dto.mimeType, dto.sizeBytes);

    const extension = MIME_TO_EXTENSION[dto.mimeType];
    const storageKey = `organizations/${organizationId}/${dto.type}-${randomUUID()}.${extension}`;
    const uploadUrl = await this.r2.getPresignedUploadUrl({
      key: storageKey,
      contentType: dto.mimeType,
      contentLength: dto.sizeBytes,
    });

    return { uploadUrl, storageKey, publicUrl: this.r2.buildPublicUrl(storageKey) };
  }

  async confirm(organizationId: string, dto: ConfirmOrganizationMediaDto) {
    this.validateAgainstLimits(dto.mimeType, dto.sizeBytes);

    // Never trust the client-declared size alone — re-verify against what R2
    // actually stored, same "server always re-validates" philosophy as
    // event-media's confirm().
    const head = await this.r2.headObject(dto.storageKey);
    if (!head || head.sizeBytes !== dto.sizeBytes) {
      throw new BadRequestException('Uploaded object not found or size mismatch');
    }

    const previous = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: PREVIOUS_KEY_SELECT,
    });
    const previousKey = dto.type === 'avatar' ? previous.avatarStorageKey : previous.coverStorageKey;
    const publicUrl = this.r2.buildPublicUrl(dto.storageKey);

    const updated = await this.prisma.organization.update({
      where: { id: organizationId },
      data:
        dto.type === 'avatar'
          ? { avatarStorageKey: dto.storageKey, avatarImageUrl: publicUrl }
          : { coverStorageKey: dto.storageKey, coverImageUrl: publicUrl },
      select: PROFILE_SELECT,
    });

    // Swap the DB pointer to the new object BEFORE deleting the old one:
    // never a window where the row points at nothing. If this delete fails,
    // the old object becomes an invisible orphan in R2 — acceptable, unlike
    // a broken image.
    if (previousKey) {
      await this.r2.deleteObject(previousKey);
    }

    return updated;
  }

  async remove(organizationId: string, type: string) {
    this.assertValidType(type);

    const previous = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: PREVIOUS_KEY_SELECT,
    });
    const previousKey = type === 'avatar' ? previous.avatarStorageKey : previous.coverStorageKey;

    const updated = await this.prisma.organization.update({
      where: { id: organizationId },
      data:
        type === 'avatar'
          ? { avatarStorageKey: null, avatarImageUrl: null }
          : { coverStorageKey: null, coverImageUrl: null },
      select: PROFILE_SELECT,
    });

    // Null the DB pointer first: as soon as it's null there is no dangling
    // reference, so the R2 delete that follows is best-effort cleanup, not a
    // safety requirement. Calling this twice in a row is not an error — the
    // slot is already at its default state, so both calls return 200.
    if (previousKey) {
      await this.r2.deleteObject(previousKey);
    }

    return updated;
  }

  private assertValidType(type: string): asserts type is OrganizationMediaType {
    if (!ORGANIZATION_MEDIA_TYPES.includes(type as OrganizationMediaType)) {
      throw new BadRequestException(`Invalid media type: ${type}`);
    }
  }

  private validateAgainstLimits(mimeType: string, sizeBytes: number) {
    const limits = MEDIA_LIMITS.IMAGE;
    if (!limits.allowedMimeTypes.includes(mimeType)) {
      throw new BadRequestException(`Unsupported mime type: ${mimeType}`);
    }
    if (sizeBytes > limits.maxSizeBytes) {
      throw new BadRequestException('File exceeds the max size allowed');
    }
  }
}
