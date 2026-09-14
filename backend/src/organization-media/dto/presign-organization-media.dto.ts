import { IsIn, IsInt, IsString, Min } from 'class-validator';

export type OrganizationMediaType = 'avatar' | 'cover';

export const ORGANIZATION_MEDIA_TYPES: OrganizationMediaType[] = ['avatar', 'cover'];

export class PresignOrganizationMediaDto {
  @IsIn(ORGANIZATION_MEDIA_TYPES)
  type!: OrganizationMediaType;

  @IsString()
  mimeType!: string;

  @IsInt()
  @Min(1)
  sizeBytes!: number;
}
