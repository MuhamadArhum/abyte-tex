import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { Action, Resource } from '../common/rbac.constants';
import { ShiftsService } from './shifts.service';
import { CreateShiftDto, UpdateShiftDto } from './dto/shift.dto';

@Controller('factories/:factoryId/shifts')
export class ShiftsController {
  constructor(private readonly shiftsService: ShiftsService) {}

  @RequirePermission(Resource.SHIFT, Action.CREATE)
  @Post()
  create(@Param('factoryId') factoryId: string, @Body() dto: CreateShiftDto) {
    return this.shiftsService.create(factoryId, dto);
  }

  @RequirePermission(Resource.SHIFT, Action.VIEW)
  @Get()
  list(@Param('factoryId') factoryId: string) {
    return this.shiftsService.list(factoryId);
  }

  @RequirePermission(Resource.SHIFT, Action.VIEW)
  @Get(':id')
  getById(@Param('factoryId') factoryId: string, @Param('id') id: string) {
    return this.shiftsService.getById(factoryId, id);
  }

  @RequirePermission(Resource.SHIFT, Action.UPDATE)
  @Patch(':id')
  update(@Param('factoryId') factoryId: string, @Param('id') id: string, @Body() dto: UpdateShiftDto) {
    return this.shiftsService.update(factoryId, id, dto);
  }
}
