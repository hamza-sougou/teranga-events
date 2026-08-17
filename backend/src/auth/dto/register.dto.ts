import { IsEmail, Matches, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @MinLength(8)
  password!: string;

  @MinLength(2)
  fullName!: string;

  @MinLength(2)
  organizationName!: string;

  @Matches(/^[a-z0-9-]+$/, {
    message: 'organizationSlug must contain only lowercase letters, digits and hyphens',
  })
  organizationSlug!: string;
}
