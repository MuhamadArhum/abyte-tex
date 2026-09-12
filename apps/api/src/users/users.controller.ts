import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { Action, Resource } from '../common/rbac.constants';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { UsersService } from './users.service';
import { InviteUserDto } from './dto/invite-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /** Every authenticated user can view their own profile — no USER:VIEW permission required. */
  @Get('me')
  getOwnProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getUserById(user.userId);
  }

  @RequirePermission(Resource.USER, Action.CREATE)
  @Post()
  invite(@Body() dto: InviteUserDto) {
    return this.usersService.inviteUser(dto);
  }

  @RequirePermission(Resource.USER, Action.VIEW)
  @Get()
  list(@Query() query: PaginationQueryDto) {
    return this.usersService.listUsers(query);
  }

  @RequirePermission(Resource.USER, Action.VIEW)
  @Get(':id')
  getById(@Param('id') id: string) {
    return this.usersService.getUserById(id);
  }

  @RequirePermission(Resource.USER, Action.UPDATE)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.updateUser(id, dto);
  }
}
