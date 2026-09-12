import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { Action, Resource } from '../common/rbac.constants';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { FactoriesService } from './factories.service';
import { CreateFactoryDto } from './dto/create-factory.dto';
import { UpdateFactoryDto } from './dto/update-factory.dto';

@Controller('factories')
export class FactoriesController {
  constructor(private readonly factoriesService: FactoriesService) {}

  @RequirePermission(Resource.FACTORY, Action.CREATE)
  @Post()
  create(@Body() dto: CreateFactoryDto) {
    return this.factoriesService.create(dto);
  }

  @RequirePermission(Resource.FACTORY, Action.VIEW)
  @Get()
  list(@Query() query: PaginationQueryDto) {
    return this.factoriesService.list(query);
  }

  @RequirePermission(Resource.FACTORY, Action.VIEW)
  @Get(':id')
  getById(@Param('id') id: string) {
    return this.factoriesService.getById(id);
  }

  @RequirePermission(Resource.FACTORY, Action.UPDATE)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateFactoryDto) {
    return this.factoriesService.update(id, dto);
  }
}
