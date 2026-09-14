import { IsEmail } from 'class-validator';

export class SubscribeOrganizerDto {
  @IsEmail()
  email!: string;
}
