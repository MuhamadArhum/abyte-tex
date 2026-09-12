import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Action, Resource } from '../common/rbac.constants';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { DispatchService } from './dispatch.service';
import { CreateDispatchDto } from './dto/create-dispatch.dto';

@Controller('dispatches')
export class DispatchController {
  constructor(private readonly dispatchService: DispatchService) {}

  @RequirePermission(Resource.DISPATCH, Action.CREATE)
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateDispatchDto) {
    return this.dispatchService.create(dto, user.userId);
  }

  @RequirePermission(Resource.DISPATCH, Action.VIEW)
  @Get()
  list(@Query() query: PaginationQueryDto & { salesOrderId?: string }) {
    return this.dispatchService.list(query);
  }

  @RequirePermission(Resource.DISPATCH, Action.VIEW)
  @Get(':id')
  getById(@Param('id') id: string) {
    return this.dispatchService.getById(id);
  }
}
