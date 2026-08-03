import { Body, Controller, Delete, Get, Headers, Inject, Param, Post } from '@nestjs/common';
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

  @Get(':ownerType/:ownerId')
  async listForOwner(
    @Headers('cookie') cookieHeader: string | undefined,
    @Param('ownerType') ownerType: string,
    @Param('ownerId') ownerId: string
  ): Promise<PublicMediaAsset[]> {
    return this.media.listForOwner(cookieHeader, ownerType, ownerId);
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
