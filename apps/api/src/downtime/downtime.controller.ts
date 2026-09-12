import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { Action, Resource } from '../common/rbac.constants';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { DowntimeService } from './downtime.service';
import { CloseDowntimeDto, CreateDowntimeDto } from './dto/downtime.dto';

@Controller('downtime')
export class DowntimeController {
  constructor(private readonly downtimeService: DowntimeService) {}

  @RequirePermission(Resource.DOWNTIME, Action.CREATE)
  @Post()
  create(@Body() dto: CreateDowntimeDto) {
    return this.downtimeService.create(dto);
  }

  @RequirePermission(Resource.DOWNTIME, Action.VIEW)
  @Get()
  list(@Query() query: PaginationQueryDto & { machineId?: string }) {
    return this.downtimeService.list(query);
  }

  @RequirePermission(Resource.DOWNTIME, Action.VIEW)
  @Get(':id')
  getById(@Param('id') id: string) {
    return this.downtimeService.getById(id);
  }

  @RequirePermission(Resource.DOWNTIME, Action.UPDATE)
  @Patch(':id/close')
  close(@Param('id') id: string, @Body() dto: CloseDowntimeDto) {
    return this.downtimeService.close(id, dto);
  }
}
