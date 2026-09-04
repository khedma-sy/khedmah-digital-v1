import { Body, Controller, Delete, Get, Header, Headers, Inject, Param, Patch, Post, StreamableFile } from '@nestjs/common';
import { MediaService } from './media.service';
import { PublicMediaAsset, UploadMediaRequest } from './media.types';

@Controller('media')
export class MediaController {
  constructor(@Inject(MediaService) private readonly media: MediaService) {}

  @Post()
  async upload(
    @Headers('cookie') cookieHeader: string | undefined,
    @Body() body: UploadMediaRequest
  ): Promise<PublicMediaAsset> {
    return this.media.upload(cookieHeader, body);
  }

  @Get('public/:id')
  @Header('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400')
  async readPublic(@Param('id') id: string): Promise<StreamableFile> {
    const asset = await this.media.readPublic(id);
    return new StreamableFile(asset.data, { type: asset.mimeType });
  }

  @Get('secure/:id')
  @Header('Cache-Control','private, no-store')
  async readSecure(@Headers('cookie')cookie:string|undefined,@Param('id')id:string):Promise<StreamableFile>{const asset=await this.media.readSecure(cookie,id);return new StreamableFile(asset.data,{type:asset.mimeType});}

  @Get(':ownerType/:ownerId')
  async listForOwner(
    @Headers('cookie') cookieHeader: string | undefined,
    @Param('ownerType') ownerType: string,
    @Param('ownerId') ownerId: string
  ): Promise<PublicMediaAsset[]> {
    return this.media.listForOwner(cookieHeader, ownerType, ownerId);
  }

  @Patch(':id/driver-document-review')
  reviewDriverDocument(
    @Headers('cookie')cookieHeader:string|undefined,
    @Param('id')id:string,
    @Body()body:Record<string,unknown>
  ){
    return this.media.reviewDriverDocument(cookieHeader,id,body.status,body.reason);
  }

  @Delete(':id')
  async delete(
    @Headers('cookie') cookieHeader: string | undefined,
    @Param('id') id: string
  ): Promise<{ deleted: boolean }> {
    await this.media.delete(cookieHeader, id);
    return { deleted: true };
  }
}
