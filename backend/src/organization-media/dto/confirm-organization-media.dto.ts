import { IsIn, IsInt, IsString, Min } from 'class-validator';
import { ORGANIZATION_MEDIA_TYPES, OrganizationMediaType } from './presign-organization-media.dto';

export class ConfirmOrganizationMediaDto {
  @IsIn(ORGANIZATION_MEDIA_TYPES)
  type!: OrganizationMediaType;

  @IsString()
  storageKey!: string;

  @IsString()
  mimeType!: string;

  @IsInt()
  @Min(1)
  sizeBytes!: number;
}
