import { Body, Controller, Delete, Get, Header, Headers, Inject, Param, Post, StreamableFile } from '@nestjs/common';
import { AdMediaService } from './ad-media.service';

@Controller('classifieds')
export class AdMediaController {
  constructor(@Inject(AdMediaService) private readonly media: AdMediaService) {}

  @Post(':id/media')
  async upload(
    @Headers('cookie') cookie: string | undefined,
    @Param('id') id: string,
    @Body() body: unknown
  ) {
    return this.media.upload(cookie, id, body);
  }

  @Get(':id/media')
  async listMine(@Headers('cookie') cookie: string | undefined, @Param('id') id: string) {
    return { images: await this.media.listMine(cookie, id) };
  }

  @Get(':id/media/:mediaId')
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'Cookie')
  async readMine(
    @Headers('cookie') cookie: string | undefined,
    @Param('id') id: string,
    @Param('mediaId') mediaId: string
  ): Promise<StreamableFile> {
    const object = await this.media.readMine(cookie, id, mediaId);
    return new StreamableFile(object.data, { type: object.mimeType });
  }

  @Delete(':id/media/:mediaId')
  async remove(
    @Headers('cookie') cookie: string | undefined,
    @Param('id') id: string,
    @Param('mediaId') mediaId: string,
    @Body() body: unknown
  ) {
    return this.media.remove(cookie, id, mediaId, body);
  }

  @Get('media/public/:mediaId')
  @Header('Cache-Control', 'private, no-store')
  async readPublic(@Param('mediaId') mediaId: string): Promise<StreamableFile> {
    const object = await this.media.readPublic(mediaId);
    return new StreamableFile(object.data, { type: object.mimeType });
  }
}

@Controller('admin/classifieds')
export class AdminAdMediaController {
  constructor(@Inject(AdMediaService) private readonly media: AdMediaService) {}

  @Get('media/:mediaId')
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'Cookie')
  async readForReview(
    @Headers('cookie') cookie: string | undefined,
    @Param('mediaId') mediaId: string
  ): Promise<StreamableFile> {
    const object = await this.media.readForReview(cookie, mediaId);
    return new StreamableFile(object.data, { type: object.mimeType });
  }
}
