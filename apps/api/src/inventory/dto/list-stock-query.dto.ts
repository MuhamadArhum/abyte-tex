import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class ListStockQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() warehouseId?: string;
  @IsOptional() @IsString() productId?: string;
  @IsOptional() @IsString() materialId?: string;
}
