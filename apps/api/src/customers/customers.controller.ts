import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { Action, Resource } from '../common/rbac.constants';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { CustomersService } from './customers.service';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @RequirePermission(Resource.CUSTOMER, Action.CREATE)
  @Post()
  create(@Body() dto: CreateCustomerDto) {
    return this.customersService.create(dto);
  }

  @RequirePermission(Resource.CUSTOMER, Action.VIEW)
  @Get()
  list(@Query() query: PaginationQueryDto) {
    return this.customersService.list(query);
  }

  @RequirePermission(Resource.CUSTOMER, Action.VIEW)
  @Get(':id')
  getById(@Param('id') id: string) {
    return this.customersService.getById(id);
  }

  @RequirePermission(Resource.CUSTOMER, Action.UPDATE)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.customersService.update(id, dto);
  }
}
