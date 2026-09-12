import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { Action, Resource } from '../common/rbac.constants';
import { WarehousesService } from './warehouses.service';
import { CreateLocationDto, CreateWarehouseDto, UpdateWarehouseDto } from './dto/warehouse.dto';

@Controller('factories/:factoryId/warehouses')
export class WarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  @RequirePermission(Resource.WAREHOUSE, Action.CREATE)
  @Post()
  create(@Param('factoryId') factoryId: string, @Body() dto: CreateWarehouseDto) {
    return this.warehousesService.create(factoryId, dto);
  }

  @RequirePermission(Resource.WAREHOUSE, Action.VIEW)
  @Get()
  list(@Param('factoryId') factoryId: string) {
    return this.warehousesService.list(factoryId);
  }

  @RequirePermission(Resource.WAREHOUSE, Action.VIEW)
  @Get(':id')
  getById(@Param('factoryId') factoryId: string, @Param('id') id: string) {
    return this.warehousesService.getById(factoryId, id);
  }

  @RequirePermission(Resource.WAREHOUSE, Action.UPDATE)
  @Patch(':id')
  update(@Param('factoryId') factoryId: string, @Param('id') id: string, @Body() dto: UpdateWarehouseDto) {
    return this.warehousesService.update(factoryId, id, dto);
  }

  @RequirePermission(Resource.WAREHOUSE, Action.CREATE)
  @Post(':id/locations')
  addLocation(@Param('factoryId') factoryId: string, @Param('id') id: string, @Body() dto: CreateLocationDto) {
    return this.warehousesService.addLocation(factoryId, id, dto);
  }

  @RequirePermission(Resource.WAREHOUSE, Action.VIEW)
  @Get(':id/locations')
  listLocations(@Param('factoryId') factoryId: string, @Param('id') id: string) {
    return this.warehousesService.listLocations(factoryId, id);
  }
}
