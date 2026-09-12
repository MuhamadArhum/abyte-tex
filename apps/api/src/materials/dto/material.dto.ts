import { IsEnum, IsNumber, IsOptional, IsString, Matches, Min, MinLength } from 'class-validator';

export enum MaterialTypeDto {
  YARN = 'YARN',
  COTTON = 'COTTON',
  CHEMICAL = 'CHEMICAL',
  DYE = 'DYE',
  PACKING = 'PACKING',
  ACCESSORY = 'ACCESSORY',
  CONSUMABLE = 'CONSUMABLE',
  OTHER = 'OTHER',
}

export enum ProductStatusDto {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  DISCONTINUED = 'DISCONTINUED',
}

/** Fields per SRS §5.4.2. */
export class CreateMaterialDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{2,40}$/, { message: 'code must be 2-40 letters, numbers, hyphens, or underscores' })
  code!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsEnum(MaterialTypeDto)
  type!: MaterialTypeDto;

  @IsString()
  @MinLength(1)
  unit!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  reorderLevel?: number;
}

export class UpdateMaterialDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEnum(MaterialTypeDto) type?: MaterialTypeDto;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsNumber() @Min(0) reorderLevel?: number;
  @IsOptional() @IsEnum(ProductStatusDto) status?: ProductStatusDto;
}
