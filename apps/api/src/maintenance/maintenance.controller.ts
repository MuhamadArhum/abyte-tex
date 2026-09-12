import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { Action, Resource } from '../common/rbac.constants';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { MaintenanceService } from './maintenance.service';
import {
  CreateMaintenanceJobDto,
  CreateMaintenanceScheduleDto,
  UpdateMaintenanceJobDto,
} from './dto/maintenance-job.dto';

@Controller()
export class MaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  @RequirePermission(Resource.MAINTENANCE_JOB, Action.CREATE)
  @Post('maintenance-jobs')
  createJob(@Body() dto: CreateMaintenanceJobDto) {
    return this.maintenanceService.createJob(dto);
  }

  @RequirePermission(Resource.MAINTENANCE_JOB, Action.VIEW)
  @Get('maintenance-jobs')
  list(@Query() query: PaginationQueryDto & { machineId?: string; status?: string }) {
    return this.maintenanceService.list(query);
  }

  @RequirePermission(Resource.MAINTENANCE_JOB, Action.VIEW)
  @Get('maintenance-jobs/:id')
  getById(@Param('id') id: string) {
    return this.maintenanceService.getById(id);
  }

  @RequirePermission(Resource.MAINTENANCE_JOB, Action.UPDATE)
  @Patch('maintenance-jobs/:id')
  update(@Param('id') id: string, @Body() dto: UpdateMaintenanceJobDto) {
    return this.maintenanceService.update(id, dto);
  }

  @RequirePermission(Resource.MAINTENANCE_JOB, Action.CREATE)
  @Post('maintenance-schedules')
  createSchedule(@Body() dto: CreateMaintenanceScheduleDto) {
    return this.maintenanceService.createSchedule(dto);
  }

  @RequirePermission(Resource.MAINTENANCE_JOB, Action.VIEW)
  @Get('maintenance-schedules')
  listSchedules() {
    return this.maintenanceService.listSchedules();
  }

  @RequirePermission(Resource.MAINTENANCE_JOB, Action.VIEW)
  @Get('maintenance-schedules/due-soon')
  listDueSoon() {
    return this.maintenanceService.listDueSoon();
  }
}
