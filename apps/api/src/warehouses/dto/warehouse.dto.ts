import { IsEnum, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export enum WarehouseTypeDto {
  RAW_MATERIAL = 'RAW_MATERIAL',
  WIP = 'WIP',
  FINISHED_GOODS = 'FINISHED_GOODS',
  PACKING = 'PACKING',
  GENERAL = 'GENERAL',
}

export class CreateWarehouseDto {
  @IsString()
  @Matches(/^[A-Z0-9_-]{2,20}$/, { message: 'code must be 2-20 uppercase letters, numbers, hyphens, or underscores' })
  code!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsEnum(WarehouseTypeDto)
  type!: WarehouseTypeDto;

  @IsOptional() @IsString() address?: string;
}

export class UpdateWarehouseDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEnum(WarehouseTypeDto) type?: WarehouseTypeDto;
  @IsOptional() @IsString() address?: string;
}

export class CreateLocationDto {
  @IsString()
  @MinLength(1)
  code!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional() @IsString() rack?: string;
  @IsOptional() @IsString() bin?: string;
}
