import { IsArray, IsIn, IsObject, IsString, MinLength } from 'class-validator';

export class CreateInspectionTemplateDto {
  @IsString() @MinLength(1) name!: string;

  @IsIn(['PRODUCTION_BATCH', 'GOODS_RECEIPT', 'DISPATCH'])
  appliesTo!: 'PRODUCTION_BATCH' | 'GOODS_RECEIPT' | 'DISPATCH';

  @IsArray()
  @IsObject({ each: true })
  checklistItems!: Array<{ label: string; type: string; required?: boolean }>;
}
