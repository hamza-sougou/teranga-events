import { IsEmail, IsOptional, Matches, MaxLength, MinLength } from 'class-validator';
import { SENEGAL_PHONE_MESSAGE, SENEGAL_PHONE_REGEX } from './phone.validator';

export class UpdateOrganizationDto {
  @IsOptional()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @Matches(SENEGAL_PHONE_REGEX, { message: SENEGAL_PHONE_MESSAGE })
  contactPhone?: string;

  @IsOptional()
  @MaxLength(500)
  bio?: string;
}
