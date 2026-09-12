import { ArrayNotEmpty, IsArray, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class InviteUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  firstName!: string;

  @IsString()
  @MinLength(1)
  lastName!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  /** Role IDs within the caller's own tenant. */
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  roleIds!: string[];

  /** Factory IDs the user should be granted access to (SRS §5.1 factory access management). */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  factoryIds?: string[];
}
