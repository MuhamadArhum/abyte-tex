import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { Action, Resource } from '../common/rbac.constants';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { ProductsService } from './products.service';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';
import { CreateProductCategoryDto } from './dto/product-category.dto';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @RequirePermission(Resource.PRODUCT, Action.CREATE)
  @Post('categories')
  createCategory(@Body() dto: CreateProductCategoryDto) {
    return this.productsService.createCategory(dto);
  }

  @RequirePermission(Resource.PRODUCT, Action.VIEW)
  @Get('categories')
  listCategories() {
    return this.productsService.listCategories();
  }

  @RequirePermission(Resource.PRODUCT, Action.CREATE)
  @Post()
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @RequirePermission(Resource.PRODUCT, Action.VIEW)
  @Get()
  list(@Query() query: PaginationQueryDto) {
    return this.productsService.list(query);
  }

  @RequirePermission(Resource.PRODUCT, Action.VIEW)
  @Get(':id')
  getById(@Param('id') id: string) {
    return this.productsService.getById(id);
  }

  @RequirePermission(Resource.PRODUCT, Action.UPDATE)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }
}
