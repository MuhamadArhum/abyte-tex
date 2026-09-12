import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { Action, Resource } from '../common/rbac.constants';
import { RolesService } from './roles.service';
import { SetRolePermissionsDto } from './dto/set-role-permissions.dto';

@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @RequirePermission(Resource.ROLE, Action.VIEW)
  @Get()
  list() {
    return this.rolesService.listRoles();
  }

  @RequirePermission(Resource.ROLE, Action.VIEW)
  @Get(':id')
  getById(@Param('id') id: string) {
    return this.rolesService.getRoleById(id);
  }

  @RequirePermission(Resource.ROLE, Action.UPDATE)
  @Put(':id/permissions')
  setPermissions(@Param('id') id: string, @Body() dto: SetRolePermissionsDto) {
    return this.rolesService.setRolePermissions(id, dto);
  }
}
