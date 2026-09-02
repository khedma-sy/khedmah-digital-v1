import { Body, Controller, Get, Headers, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { ProductService } from './product.service';

@Controller('products')
export class ProductController {
  constructor(@Inject(ProductService) private readonly products: ProductService) {}
  @Get() async list(@Query('q') q?: string, @Query('categoryCode') categoryCode?: string, @Query('cityCode') cityCode?: string) { return { products: await this.products.listPublic({ q, categoryCode, cityCode }) }; }
  @Get('mine') async mine(@Headers('cookie') cookie: string | undefined) { const products = await this.products.listMine(cookie); return { products, count: products.filter((product) => product.status !== 'inactive').length, limit: this.products.listingLimitPerUser() }; }
  @Post() async create(@Headers('cookie') cookie: string | undefined, @Body() body: Record<string, unknown>) { return { product: await this.products.create(cookie, body) }; }
  @Patch(':id') async update(@Headers('cookie') cookie: string | undefined, @Param('id') id: string, @Body() body: Record<string, unknown>) { return { product: await this.products.update(cookie, id, body) }; }
  @Post(':id/submit') async submit(@Headers('cookie') cookie: string | undefined, @Param('id') id: string) { return { product: await this.products.submit(cookie, id) }; }
  @Post(':id/deactivate') async deactivate(@Headers('cookie') cookie: string | undefined, @Param('id') id: string) { return { product: await this.products.deactivate(cookie, id) }; }
  @Get(':id') async get(@Param('id') id: string) { return { product: await this.products.getPublic(id) }; }
}

@Controller('admin/products')
export class AdminProductController {
  constructor(@Inject(ProductService) private readonly products: ProductService) {}
  @Get('pending') async pending(@Headers('cookie') cookie: string | undefined) { return { products: await this.products.listPending(cookie) }; }
  @Patch(':id/moderation') async review(@Headers('cookie') cookie: string | undefined, @Param('id') id: string, @Body() body: { status: 'approved' | 'rejected'; reason?: string }) { return { product: await this.products.review(cookie, id, body.status, body.reason) }; }
}
