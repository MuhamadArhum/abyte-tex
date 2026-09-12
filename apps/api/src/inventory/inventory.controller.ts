import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Action, Resource } from '../common/rbac.constants';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { InventoryService } from './inventory.service';
import { ManualMovementType, RecordMovementDto, TransferStockDto } from './dto/record-movement.dto';
import { ListStockQueryDto } from './dto/list-stock-query.dto';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @RequirePermission(Resource.STOCK, Action.VIEW)
  @Get('stock')
  getStockLevels(@Query() query: ListStockQueryDto) {
    return this.inventoryService.getStockLevels(query);
  }

  @RequirePermission(Resource.STOCK, Action.VIEW)
  @Get('movements')
  listMovements(@Query() query: ListStockQueryDto) {
    return this.inventoryService.listMovements(query);
  }

  @RequirePermission(Resource.STOCK, Action.CREATE)
  @Post('movements')
  recordMovement(@CurrentUser() user: AuthenticatedUser, @Body() dto: RecordMovementDto) {
    const signedQuantity =
      dto.type === ManualMovementType.ISSUE
        ? -Math.abs(dto.quantity)
        : dto.type === ManualMovementType.ADJUSTMENT && dto.decrease
          ? -Math.abs(dto.quantity)
          : Math.abs(dto.quantity);

    return this.inventoryService.recordMovement(user.userId, {
      warehouseId: dto.warehouseId,
      locationId: dto.locationId,
      productId: dto.productId,
      materialId: dto.materialId,
      batchNumber: dto.batchNumber,
      type: dto.type,
      quantity: signedQuantity,
      unit: dto.unit,
      notes: dto.notes,
    });
  }

  @RequirePermission(Resource.STOCK, Action.CREATE)
  @Post('transfer')
  transfer(@CurrentUser() user: AuthenticatedUser, @Body() dto: TransferStockDto) {
    return this.inventoryService.transferStock(user.userId, dto);
  }
}
