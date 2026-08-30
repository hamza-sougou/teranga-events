import { IsNotEmpty, IsString } from 'class-validator';

export class GooglePendingTokenDto {
  @IsString()
  @IsNotEmpty()
  token!: string;
}
