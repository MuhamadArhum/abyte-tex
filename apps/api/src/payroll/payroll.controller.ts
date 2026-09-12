import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { Action, Resource } from '../common/rbac.constants';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { PayrollService } from './payroll.service';
import { AddPayrollEntryDto, CreatePayrollPeriodDto, UpdatePayrollPeriodStatusDto } from './dto/payroll.dto';

@Controller('payroll-periods')
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @RequirePermission(Resource.PAYROLL, Action.CREATE)
  @Post()
  createPeriod(@Body() dto: CreatePayrollPeriodDto) {
    return this.payrollService.createPeriod(dto);
  }

  @RequirePermission(Resource.PAYROLL, Action.VIEW)
  @Get()
  list(@Query() query: PaginationQueryDto & { factoryId?: string }) {
    return this.payrollService.list(query);
  }

  @RequirePermission(Resource.PAYROLL, Action.VIEW)
  @Get(':id')
  getById(@Param('id') id: string) {
    return this.payrollService.getById(id);
  }

  @RequirePermission(Resource.PAYROLL, Action.CREATE)
  @Post(':id/entries')
  addEntry(@Param('id') id: string, @Body() dto: AddPayrollEntryDto) {
    return this.payrollService.addEntry(id, dto);
  }

  @RequirePermission(Resource.PAYROLL, Action.APPROVE)
  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdatePayrollPeriodStatusDto) {
    return this.payrollService.updateStatus(id, dto);
  }
}
