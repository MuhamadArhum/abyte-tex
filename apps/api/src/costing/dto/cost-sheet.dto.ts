import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

/** Total Production Cost = Material + Labor + Machine + Energy/Process + Packing + Overhead — SRS §11. */
export class CreateCostSheetDto {
  @IsOptional() @IsString() productionOrderId?: string;
  @IsOptional() @IsString() productionBatchId?: string;

  @IsNumber() @Min(0) materialCost!: number;
  @IsNumber() @Min(0) laborCost!: number;
  @IsNumber() @Min(0) machineCost!: number;
  @IsNumber() @Min(0) energyCost!: number;
  @IsNumber() @Min(0) packingCost!: number;
  @IsNumber() @Min(0) overheadCost!: number;

  @IsOptional() @IsNumber() @Min(0) estimatedCost?: number;
}
