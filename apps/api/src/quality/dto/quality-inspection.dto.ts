import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';

export enum QualityOutcomeDto {
  PASS = 'PASS',
  REWORK = 'REWORK',
  HOLD = 'HOLD',
  REJECT = 'REJECT',
}

export enum DefectSeverityDto {
  MINOR = 'MINOR',
  MAJOR = 'MAJOR',
  CRITICAL = 'CRITICAL',
}

export class DefectInputDto {
  @IsString() defectType!: string;
  @IsEnum(DefectSeverityDto) severity!: DefectSeverityDto;
  @IsOptional() @IsNumber() quantity?: number;
  @IsOptional() @IsString() notes?: string;
}

/** Textile-specific fields per SRS §9.1. */
export class CreateQualityInspectionDto {
  @IsString() factoryId!: string;
  @IsOptional() @IsString() templateId?: string;
  @IsOptional() @IsString() productionBatchId?: string;
  @IsOptional() @IsString() goodsReceiptId?: string;
  @IsOptional() @IsString() salesOrderId?: string;

  @IsEnum(QualityOutcomeDto) outcome!: QualityOutcomeDto;

  @IsOptional() @IsNumber() gsm?: number;
  @IsOptional() @IsNumber() width?: number;
  @IsOptional() @IsString() shade?: string;
  @IsOptional() @IsNumber() rollLength?: number;
  @IsOptional() @IsNumber() weight?: number;
  @IsOptional() @IsString() colorVariation?: string;
  @IsOptional() @IsString() stitchingDefects?: string;
  @IsOptional() @IsString() notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DefectInputDto)
  defects?: DefectInputDto[];
}
