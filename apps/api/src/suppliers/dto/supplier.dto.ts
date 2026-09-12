import { IsEmail, IsEnum, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export enum PartyStatusDto {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  BLOCKED = 'BLOCKED',
}

/** Fields per SRS §5.4.4 ("Supplier history" is derived from the PurchaseOrder relation, not a stored field). */
export class CreateSupplierDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional() @IsString() contactPerson?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() paymentTerms?: string;
  @IsOptional() @IsInt() @Min(1) @Max(5) rating?: number;
}

export class UpdateSupplierDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() contactPerson?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() paymentTerms?: string;
  @IsOptional() @IsInt() @Min(1) @Max(5) rating?: number;
  @IsOptional() @IsEnum(PartyStatusDto) status?: PartyStatusDto;
}
