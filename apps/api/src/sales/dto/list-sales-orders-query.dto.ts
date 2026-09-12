import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { SALES_ORDER_STATUSES, SalesOrderStatus } from './update-sales-order-status.dto';

export class ListSalesOrdersQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() factoryId?: string;
  @IsOptional() @IsIn(SALES_ORDER_STATUSES) status?: SalesOrderStatus;
}
