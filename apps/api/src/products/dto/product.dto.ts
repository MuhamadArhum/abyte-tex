import { IsEnum, IsNumber, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export enum ProductStatusDto {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  DISCONTINUED = 'DISCONTINUED',
}

/** Fields per SRS §5.4.1. */
export class CreateProductDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{2,40}$/, { message: 'sku must be 2-40 letters, numbers, hyphens, or underscores' })
  sku!: string;

  @IsOptional() @IsString() code?: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional() @IsString() categoryId?: string;

  @IsString()
  @MinLength(1)
  unit!: string;

  @IsOptional() @IsString() fabricType?: string;
  @IsOptional() @IsNumber() gsm?: number;
  @IsOptional() @IsNumber() width?: number;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsString() shade?: string;
  @IsOptional() @IsString() composition?: string;
  @IsOptional() @IsString() brand?: string;
}

export class UpdateProductDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsString() fabricType?: string;
  @IsOptional() @IsNumber() gsm?: number;
  @IsOptional() @IsNumber() width?: number;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsString() shade?: string;
  @IsOptional() @IsString() composition?: string;
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsEnum(ProductStatusDto) status?: ProductStatusDto;
}
