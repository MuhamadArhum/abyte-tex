import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Action, Resource } from '../common/rbac.constants';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { ProcurementService } from './procurement.service';
import { CreatePurchaseRequestDto, UpdatePurchaseRequestStatusDto } from './dto/purchase-request.dto';
import { CreatePurchaseOrderDto, UpdatePurchaseOrderStatusDto } from './dto/purchase-order.dto';
import { CreateGoodsReceiptDto } from './dto/goods-receipt.dto';

@Controller()
export class ProcurementController {
  constructor(private readonly procurementService: ProcurementService) {}

  // Purchase Requests
  @RequirePermission(Resource.PURCHASE_ORDER, Action.CREATE)
  @Post('purchase-requests')
  createRequest(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePurchaseRequestDto) {
    return this.procurementService.createRequest(dto, user.userId);
  }

  @RequirePermission(Resource.PURCHASE_ORDER, Action.VIEW)
  @Get('purchase-requests')
  listRequests(@Query() query: PaginationQueryDto & { factoryId?: string }) {
    return this.procurementService.listRequests(query);
  }

  @RequirePermission(Resource.PURCHASE_ORDER, Action.VIEW)
  @Get('purchase-requests/:id')
  getRequestById(@Param('id') id: string) {
    return this.procurementService.getRequestById(id);
  }

  @RequirePermission(Resource.PURCHASE_ORDER, Action.APPROVE)
  @Patch('purchase-requests/:id/status')
  updateRequestStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseRequestStatusDto,
  ) {
    return this.procurementService.updateRequestStatus(id, dto, user.userId);
  }

  // Purchase Orders
  @RequirePermission(Resource.PURCHASE_ORDER, Action.CREATE)
  @Post('purchase-orders')
  createOrder(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePurchaseOrderDto) {
    return this.procurementService.createOrder(dto, user.userId);
  }

  @RequirePermission(Resource.PURCHASE_ORDER, Action.VIEW)
  @Get('purchase-orders')
  listOrders(@Query() query: PaginationQueryDto & { status?: string; factoryId?: string }) {
    return this.procurementService.listOrders(query);
  }

  @RequirePermission(Resource.PURCHASE_ORDER, Action.VIEW)
  @Get('purchase-orders/:id')
  getOrderById(@Param('id') id: string) {
    return this.procurementService.getOrderById(id);
  }

  @RequirePermission(Resource.PURCHASE_ORDER, Action.APPROVE)
  @Patch('purchase-orders/:id/status')
  updateOrderStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseOrderStatusDto,
  ) {
    return this.procurementService.updateOrderStatus(id, dto, user.userId);
  }

  // Goods Receipts
  @RequirePermission(Resource.PURCHASE_ORDER, Action.CREATE)
  @Post('goods-receipts')
  createGoodsReceipt(@Body() dto: CreateGoodsReceiptDto) {
    return this.procurementService.createGoodsReceipt(dto);
  }

  @RequirePermission(Resource.PURCHASE_ORDER, Action.APPROVE)
  @Post('goods-receipts/:id/accept')
  acceptGoodsReceipt(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.procurementService.acceptGoodsReceipt(id, user.userId);
  }

  @RequirePermission(Resource.PURCHASE_ORDER, Action.VIEW)
  @Get('goods-receipts')
  listGoodsReceipts(@Query() query: PaginationQueryDto & { factoryId?: string }) {
    return this.procurementService.listGoodsReceipts(query);
  }

  @RequirePermission(Resource.PURCHASE_ORDER, Action.VIEW)
  @Get('goods-receipts/:id')
  getGoodsReceiptById(@Param('id') id: string) {
    return this.procurementService.getGoodsReceiptById(id);
  }
}
