import { Controller, Get } from '@nestjs/common';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { Action, Resource } from '../common/rbac.constants';
import { DashboardsService } from './dashboards.service';

@Controller('dashboards')
export class DashboardsController {
  constructor(private readonly dashboardsService: DashboardsService) {}

  @RequirePermission(Resource.REPORT, Action.VIEW)
  @Get('owner')
  getOwnerDashboard() {
    return this.dashboardsService.getOwnerDashboard();
  }

  @RequirePermission(Resource.REPORT, Action.VIEW)
  @Get('production')
  getProductionDashboard() {
    return this.dashboardsService.getProductionDashboard();
  }

  @RequirePermission(Resource.REPORT, Action.VIEW)
  @Get('machines')
  getMachineDashboard() {
    return this.dashboardsService.getMachineDashboard();
  }

  @RequirePermission(Resource.REPORT, Action.VIEW)
  @Get('inventory')
  getInventoryDashboard() {
    return this.dashboardsService.getInventoryDashboard();
  }

  @RequirePermission(Resource.REPORT, Action.VIEW)
  @Get('quality')
  getQualityDashboard() {
    return this.dashboardsService.getQualityDashboard();
  }

  @RequirePermission(Resource.REPORT, Action.VIEW)
  @Get('maintenance')
  getMaintenanceDashboard() {
    return this.dashboardsService.getMaintenanceDashboard();
  }
}
