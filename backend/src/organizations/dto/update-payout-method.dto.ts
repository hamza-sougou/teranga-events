import { Matches } from 'class-validator';
import { SENEGAL_PHONE_MESSAGE, SENEGAL_PHONE_REGEX } from './phone.validator';

export class UpdatePayoutMethodDto {
  @Matches(SENEGAL_PHONE_REGEX, { message: SENEGAL_PHONE_MESSAGE })
  payoutPhoneNumber!: string;
}
