import { IsEmail, IsString, Matches, MinLength } from 'class-validator';

export class CreateTenantDto {
  @IsString()
  @MinLength(2)
  companyName!: string;

  @IsString()
  @Matches(/^[a-z0-9-]{2,50}$/, { message: 'slug must be lowercase letters, numbers, and hyphens only' })
  slug!: string;

  @IsString()
  @MinLength(2)
  ownerFirstName!: string;

  @IsString()
  @MinLength(1)
  ownerLastName!: string;

  @IsEmail()
  ownerEmail!: string;
}
