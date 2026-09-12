import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { Action, Resource } from '../common/rbac.constants';
import { AttendanceService } from './attendance.service';
import { MarkAttendanceDto, UpdateAttendanceDto } from './dto/attendance.dto';
import { ListAttendanceQueryDto } from './dto/list-attendance-query.dto';

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @RequirePermission(Resource.ATTENDANCE, Action.CREATE)
  @Post()
  mark(@Body() dto: MarkAttendanceDto) {
    return this.attendanceService.mark(dto);
  }

  @RequirePermission(Resource.ATTENDANCE, Action.VIEW)
  @Get()
  list(@Query() query: ListAttendanceQueryDto) {
    return this.attendanceService.list(query);
  }

  @RequirePermission(Resource.ATTENDANCE, Action.VIEW)
  @Get(':id')
  getById(@Param('id') id: string) {
    return this.attendanceService.getById(id);
  }

  @RequirePermission(Resource.ATTENDANCE, Action.UPDATE)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAttendanceDto) {
    return this.attendanceService.update(id, dto);
  }
}
