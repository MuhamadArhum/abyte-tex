import { IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class CreateDepartmentDto {
  @IsString()
  @Matches(/^[A-Z0-9_-]{2,20}$/, { message: 'code must be 2-20 uppercase letters, numbers, hyphens, or underscores' })
  code!: string;

  @IsString()
  @MinLength(2)
  name!: string;
}

export class UpdateDepartmentDto {
  @IsOptional() @IsString() name?: string;
}
