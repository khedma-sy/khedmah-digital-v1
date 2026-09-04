import { Body, Controller, Delete, Get, Headers, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { CreateServiceRequest, ListOwnerServicesRequest, SearchServicesRequest, UpdateServiceRequest } from './dto/service-catalog.dto';
import { ServiceCatalogService } from './service-catalog.service';

@Controller('services')
export class ServiceCatalogController {
  constructor(@Inject(ServiceCatalogService) private readonly services: ServiceCatalogService) {}

  @Post()
  async create(@Headers('cookie') cookieHeader: string | undefined, @Body() body: CreateServiceRequest) {
    return { service: await this.services.create(cookieHeader, body) };
  }

  @Get('featured')
  async getFeatured() {
    return { services: await this.services.getFeatured() };
  }

  @Get('search')
  async search(@Query('q') q?: string, @Query('categoryCode') categoryCode?: string, @Query('cityCode') cityCode?: string, @Query('page') page?: string) {
    const query: SearchServicesRequest = { q, categoryCode, cityCode, page };
    return await this.services.search(query);
  }

  @Get('owner/:ownerId')
  async listForOwner(@Headers('cookie') cookieHeader: string | undefined, @Param('ownerId') ownerId: string, @Query('ownerType') ownerType?: string) {
    const query: ListOwnerServicesRequest = { ownerType };
    return { services: await this.services.listForOwner(cookieHeader, ownerId, query) };
  }

  @Get(':id')
  async getOne(@Headers('cookie') cookieHeader: string | undefined, @Param('id') id: string) {
    return { service: await this.services.getOne(cookieHeader, id) };
  }

  @Patch(':id')
  async update(@Headers('cookie') cookieHeader: string | undefined, @Param('id') id: string, @Body() body: UpdateServiceRequest) {
    return { service: await this.services.update(cookieHeader, id, body) };
  }

  @Delete(':id')
  async delete(@Headers('cookie') cookieHeader: string | undefined, @Param('id') id: string) {
    return await this.services.delete(cookieHeader, id);
  }

  // --- Media ---
  @Post(':id/media')
  async addMedia(
    @Headers('cookie') cookieHeader: string | undefined,
    @Param('id') id: string,
    @Body() body: { url: string; storagePath: string; mimeType: string; sizeBytes?: number; sortOrder?: number }
  ) {
    const asset = await this.services.addMediaAsset(cookieHeader, id, {
      entityType: 'service',
      entityId: id,
      assetType: 'service_image' as const,
      url: body.url,
      storagePath: body.storagePath,
      mimeType: body.mimeType,
      sizeBytes: body.sizeBytes ?? 0,
      sortOrder: body.sortOrder ?? 0
    });
    return { asset };
  }

  @Get(':id/media')
  async getMedia(@Headers('cookie') cookieHeader: string | undefined, @Param('id') id: string) {
    return { assets: await this.services.getMediaAssets(id, undefined, cookieHeader) };
  }
}
