import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { Action, Resource } from '../common/rbac.constants';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { MachinesService } from './machines.service';
import { CreateMachineDto, UpdateMachineDto } from './dto/machine.dto';

@Controller()
export class MachinesController {
  constructor(private readonly machinesService: MachinesService) {}

  @RequirePermission(Resource.MACHINE, Action.CREATE)
  @Post('factories/:factoryId/machines')
  create(@Param('factoryId') factoryId: string, @Body() dto: CreateMachineDto) {
    return this.machinesService.create(factoryId, dto);
  }

  @RequirePermission(Resource.MACHINE, Action.VIEW)
  @Get('factories/:factoryId/machines')
  listByFactory(@Param('factoryId') factoryId: string, @Query() query: PaginationQueryDto) {
    return this.machinesService.list(factoryId, query);
  }

  /** Tenant-wide machine registry, used by machine/production dashboards (SRS §12.3). */
  @RequirePermission(Resource.MACHINE, Action.VIEW)
  @Get('machines')
  listAll(@Query() query: PaginationQueryDto) {
    return this.machinesService.list(undefined, query);
  }

  @RequirePermission(Resource.MACHINE, Action.VIEW)
  @Get('machines/:id')
  getById(@Param('id') id: string) {
    return this.machinesService.getById(id);
  }

  @RequirePermission(Resource.MACHINE, Action.UPDATE)
  @Patch('machines/:id')
  update(@Param('id') id: string, @Body() dto: UpdateMachineDto) {
    return this.machinesService.update(id, dto);
  }
}
