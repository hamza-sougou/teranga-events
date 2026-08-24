import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

const PROFILE_SELECT = {
  id: true,
  name: true,
  slug: true,
  contactEmail: true,
  contactPhone: true,
  payoutPhoneNumber: true,
  isVerified: true,
} as const;

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  findOne(organizationId: string) {
    return this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: PROFILE_SELECT,
    });
  }

  updateProfile(organizationId: string, dto: UpdateOrganizationDto) {
    return this.prisma.organization.update({
      where: { id: organizationId },
      data: dto,
      select: PROFILE_SELECT,
    });
  }

  updatePayoutMethod(organizationId: string, payoutPhoneNumber: string) {
    return this.prisma.organization.update({
      where: { id: organizationId },
      data: { payoutPhoneNumber },
      select: PROFILE_SELECT,
    });
  }
}
