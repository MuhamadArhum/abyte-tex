import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { Action, Resource } from '../common/rbac.constants';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { CostingService } from './costing.service';
import { CreateCostSheetDto } from './dto/cost-sheet.dto';

@Controller('cost-sheets')
export class CostingController {
  constructor(private readonly costingService: CostingService) {}

  @RequirePermission(Resource.COST_SHEET, Action.CREATE)
  @Post()
  create(@Body() dto: CreateCostSheetDto) {
    return this.costingService.create(dto);
  }

  @RequirePermission(Resource.COST_SHEET, Action.VIEW)
  @Get()
  list(@Query() query: PaginationQueryDto & { productionOrderId?: string }) {
    return this.costingService.list(query);
  }

  @RequirePermission(Resource.COST_SHEET, Action.VIEW)
  @Get(':id')
  getById(@Param('id') id: string) {
    return this.costingService.getById(id);
  }
}
