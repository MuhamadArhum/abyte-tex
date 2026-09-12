import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Action, Resource } from '../common/rbac.constants';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { QualityService } from './quality.service';
import { CreateInspectionTemplateDto } from './dto/inspection-template.dto';
import { CreateQualityInspectionDto } from './dto/quality-inspection.dto';

@Controller()
export class QualityController {
  constructor(private readonly qualityService: QualityService) {}

  @RequirePermission(Resource.QUALITY_INSPECTION, Action.CREATE)
  @Post('inspection-templates')
  createTemplate(@Body() dto: CreateInspectionTemplateDto) {
    return this.qualityService.createTemplate(dto);
  }

  @RequirePermission(Resource.QUALITY_INSPECTION, Action.VIEW)
  @Get('inspection-templates')
  listTemplates() {
    return this.qualityService.listTemplates();
  }

  @RequirePermission(Resource.QUALITY_INSPECTION, Action.CREATE)
  @Post('quality-inspections')
  createInspection(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateQualityInspectionDto) {
    return this.qualityService.createInspection(dto, user.userId);
  }

  @RequirePermission(Resource.QUALITY_INSPECTION, Action.VIEW)
  @Get('quality-inspections')
  list(@Query() query: PaginationQueryDto & { factoryId?: string; outcome?: string }) {
    return this.qualityService.list(query);
  }

  @RequirePermission(Resource.QUALITY_INSPECTION, Action.VIEW)
  @Get('quality-inspections/:id')
  getById(@Param('id') id: string) {
    return this.qualityService.getById(id);
  }
}
