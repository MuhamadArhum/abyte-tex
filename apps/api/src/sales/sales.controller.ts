import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { Action, Resource } from '../common/rbac.constants';
import { SalesService } from './sales.service';
import { CreateSalesOrderDto } from './dto/create-sales-order.dto';
import { UpdateSalesOrderStatusDto } from './dto/update-sales-order-status.dto';
import { ListSalesOrdersQueryDto } from './dto/list-sales-orders-query.dto';

@Controller('sales-orders')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @RequirePermission(Resource.SALES_ORDER, Action.CREATE)
  @Post()
  create(@Body() dto: CreateSalesOrderDto) {
    return this.salesService.createOrder(dto);
  }

  @RequirePermission(Resource.SALES_ORDER, Action.VIEW)
  @Get()
  list(@Query() query: ListSalesOrdersQueryDto) {
    return this.salesService.list(query);
  }

  @RequirePermission(Resource.SALES_ORDER, Action.VIEW)
  @Get(':id')
  getById(@Param('id') id: string) {
    return this.salesService.getById(id);
  }

  @RequirePermission(Resource.SALES_ORDER, Action.APPROVE)
  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateSalesOrderStatusDto) {
    return this.salesService.updateStatus(id, dto);
  }
}
