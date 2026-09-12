import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { Action, Resource } from '../common/rbac.constants';
import { DepartmentsService } from './departments.service';
import { CreateDepartmentDto, UpdateDepartmentDto } from './dto/department.dto';

@Controller('factories/:factoryId/departments')
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @RequirePermission(Resource.DEPARTMENT, Action.CREATE)
  @Post()
  create(@Param('factoryId') factoryId: string, @Body() dto: CreateDepartmentDto) {
    return this.departmentsService.create(factoryId, dto);
  }

  @RequirePermission(Resource.DEPARTMENT, Action.VIEW)
  @Get()
  list(@Param('factoryId') factoryId: string) {
    return this.departmentsService.list(factoryId);
  }

  @RequirePermission(Resource.DEPARTMENT, Action.VIEW)
  @Get(':id')
  getById(@Param('factoryId') factoryId: string, @Param('id') id: string) {
    return this.departmentsService.getById(factoryId, id);
  }

  @RequirePermission(Resource.DEPARTMENT, Action.UPDATE)
  @Patch(':id')
  update(@Param('factoryId') factoryId: string, @Param('id') id: string, @Body() dto: UpdateDepartmentDto) {
    return this.departmentsService.update(factoryId, id, dto);
  }
}
