import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { Action, Resource } from '../common/rbac.constants';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto, UpdateEmployeeDto } from './dto/employee.dto';

@Controller()
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @RequirePermission(Resource.EMPLOYEE, Action.CREATE)
  @Post('factories/:factoryId/employees')
  create(@Param('factoryId') factoryId: string, @Body() dto: CreateEmployeeDto) {
    return this.employeesService.create(factoryId, dto);
  }

  @RequirePermission(Resource.EMPLOYEE, Action.VIEW)
  @Get('factories/:factoryId/employees')
  listByFactory(@Param('factoryId') factoryId: string, @Query() query: PaginationQueryDto) {
    return this.employeesService.list(factoryId, query);
  }

  @RequirePermission(Resource.EMPLOYEE, Action.VIEW)
  @Get('employees')
  listAll(@Query() query: PaginationQueryDto) {
    return this.employeesService.list(undefined, query);
  }

  @RequirePermission(Resource.EMPLOYEE, Action.VIEW)
  @Get('employees/:id')
  getById(@Param('id') id: string) {
    return this.employeesService.getById(id);
  }

  @RequirePermission(Resource.EMPLOYEE, Action.UPDATE)
  @Patch('employees/:id')
  update(@Param('id') id: string, @Body() dto: UpdateEmployeeDto) {
    return this.employeesService.update(id, dto);
  }
}
