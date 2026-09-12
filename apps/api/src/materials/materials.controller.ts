import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { Action, Resource } from '../common/rbac.constants';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { MaterialsService } from './materials.service';
import { CreateMaterialDto, UpdateMaterialDto } from './dto/material.dto';

@Controller('materials')
export class MaterialsController {
  constructor(private readonly materialsService: MaterialsService) {}

  @RequirePermission(Resource.MATERIAL, Action.CREATE)
  @Post()
  create(@Body() dto: CreateMaterialDto) {
    return this.materialsService.create(dto);
  }

  @RequirePermission(Resource.MATERIAL, Action.VIEW)
  @Get()
  list(@Query() query: PaginationQueryDto) {
    return this.materialsService.list(query);
  }

  @RequirePermission(Resource.MATERIAL, Action.VIEW)
  @Get(':id')
  getById(@Param('id') id: string) {
    return this.materialsService.getById(id);
  }

  @RequirePermission(Resource.MATERIAL, Action.UPDATE)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateMaterialDto) {
    return this.materialsService.update(id, dto);
  }
}
