import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Action, Resource } from '../common/rbac.constants';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { ProductionService } from './production.service';
import { CreateProcessRouteDto } from './dto/process-route.dto';
import { CreateProductionOrderDto, UpdateProductionOrderStatusDto } from './dto/production-order.dto';
import { CreateProductionBatchDto, RecordBatchOutputDto, UpdateBatchStatusDto } from './dto/production-batch.dto';
import { RecordMaterialConsumptionDto } from './dto/material-consumption.dto';

@Controller()
export class ProductionController {
  constructor(private readonly productionService: ProductionService) {}

  // Process Routes
  @RequirePermission(Resource.PRODUCTION_ORDER, Action.CREATE)
  @Post('process-routes')
  createProcessRoute(@Body() dto: CreateProcessRouteDto) {
    return this.productionService.createProcessRoute(dto);
  }

  @RequirePermission(Resource.PRODUCTION_ORDER, Action.VIEW)
  @Get('process-routes')
  listProcessRoutes() {
    return this.productionService.listProcessRoutes();
  }

  // Production Orders
  @RequirePermission(Resource.PRODUCTION_ORDER, Action.CREATE)
  @Post('production-orders')
  createOrder(@Body() dto: CreateProductionOrderDto) {
    return this.productionService.createOrder(dto);
  }

  @RequirePermission(Resource.PRODUCTION_ORDER, Action.VIEW)
  @Get('production-orders')
  listOrders(@Query() query: PaginationQueryDto & { factoryId?: string; status?: string }) {
    return this.productionService.listOrders(query);
  }

  @RequirePermission(Resource.PRODUCTION_ORDER, Action.VIEW)
  @Get('production-orders/:id')
  getOrderById(@Param('id') id: string) {
    return this.productionService.getOrderById(id);
  }

  @RequirePermission(Resource.PRODUCTION_ORDER, Action.UPDATE)
  @Patch('production-orders/:id/status')
  updateOrderStatus(@Param('id') id: string, @Body() dto: UpdateProductionOrderStatusDto) {
    return this.productionService.updateOrderStatus(id, dto);
  }

  // Production Batches
  @RequirePermission(Resource.PRODUCTION_BATCH, Action.CREATE)
  @Post('production-batches')
  createBatch(@Body() dto: CreateProductionBatchDto) {
    return this.productionService.createBatch(dto);
  }

  @RequirePermission(Resource.PRODUCTION_BATCH, Action.VIEW)
  @Get('production-batches')
  listBatches(@Query() query: PaginationQueryDto & { productionOrderId?: string }) {
    return this.productionService.listBatches(query);
  }

  @RequirePermission(Resource.PRODUCTION_BATCH, Action.VIEW)
  @Get('production-batches/:id')
  getBatchById(@Param('id') id: string) {
    return this.productionService.getBatchById(id);
  }

  @RequirePermission(Resource.PRODUCTION_BATCH, Action.UPDATE)
  @Patch('production-batches/:id/output')
  recordOutput(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: RecordBatchOutputDto) {
    return this.productionService.recordBatchOutput(id, dto, user.userId);
  }

  @RequirePermission(Resource.PRODUCTION_BATCH, Action.UPDATE)
  @Patch('production-batches/:id/status')
  updateBatchStatus(@Param('id') id: string, @Body() dto: UpdateBatchStatusDto) {
    return this.productionService.updateBatchStatus(id, dto);
  }

  // Material Consumption
  @RequirePermission(Resource.PRODUCTION_ORDER, Action.CREATE)
  @Post('material-consumptions')
  recordConsumption(@CurrentUser() user: AuthenticatedUser, @Body() dto: RecordMaterialConsumptionDto) {
    return this.productionService.recordConsumption(dto, user.userId);
  }
}
