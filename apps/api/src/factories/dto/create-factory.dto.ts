import { IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class CreateFactoryDto {
  @IsString()
  @Matches(/^[A-Z0-9_-]{2,20}$/, { message: 'code must be 2-20 uppercase letters, numbers, hyphens, or underscores' })
  code!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() contactPhone?: string;
  @IsOptional() @IsEmail() contactEmail?: string;
}
