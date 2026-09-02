import { IsEmail, Matches, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';
import {
  normalizeSenegalPhone,
  SENEGAL_PHONE_INPUT_MESSAGE,
  SENEGAL_PHONE_INPUT_REGEX,
} from '../../organizations/dto/phone.validator';
import { ExactlyOneIdentifier } from './identifier.validator';

@ExactlyOneIdentifier()
export class ResendActivationDto {
  @ValidateIf((dto: ResendActivationDto) => dto.email !== undefined)
  @IsEmail()
  email?: string;

  @ValidateIf((dto: ResendActivationDto) => dto.phone !== undefined)
  @Matches(SENEGAL_PHONE_INPUT_REGEX, { message: SENEGAL_PHONE_INPUT_MESSAGE })
  @Transform(({ value }) => (typeof value === 'string' ? normalizeSenegalPhone(value) : value))
  phone?: string;
}
