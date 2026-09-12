import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { PlatformAdminGuard } from '../common/guards/platform-admin.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { Action, Resource } from '../common/rbac.constants';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto, UpdateTenantStatusDto } from './dto/update-tenant.dto';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @UseGuards(PlatformAdminGuard)
  @Post()
  create(@Body() dto: CreateTenantDto) {
    return this.tenantsService.createTenant(dto);
  }

  @UseGuards(PlatformAdminGuard)
  @Get()
  list(@Query() query: PaginationQueryDto) {
    return this.tenantsService.listTenants(query);
  }

  @UseGuards(PlatformAdminGuard)
  @Get(':id')
  getById(@Param('id') id: string) {
    return this.tenantsService.getTenantById(id);
  }

  @UseGuards(PlatformAdminGuard)
  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateTenantStatusDto) {
    return this.tenantsService.updateTenantStatus(id, dto);
  }

  @RequirePermission(Resource.TENANT, Action.VIEW)
  @Get('me/company')
  getOwnTenant() {
    return this.tenantsService.getOwnTenant();
  }

  @RequirePermission(Resource.TENANT, Action.UPDATE)
  @Patch('me/company')
  updateOwnTenant(@Body() dto: UpdateTenantDto) {
    return this.tenantsService.updateOwnTenant(dto);
  }
}
