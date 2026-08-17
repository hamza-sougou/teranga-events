import { ArrayMinSize, IsEmail } from 'class-validator';

export class AddWhitelistEntriesDto {
  @ArrayMinSize(1)
  @IsEmail({}, { each: true })
  emails!: string[];
}
