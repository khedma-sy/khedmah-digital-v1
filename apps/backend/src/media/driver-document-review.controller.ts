import { Body, Controller, Get, Header, Headers, Inject, Param, Post, StreamableFile } from '@nestjs/common';
import { DriverDocumentReviewService } from './driver-document-review.service';

@Controller('driver-documents')
export class DriverDocumentReviewController {
  constructor(@Inject(DriverDocumentReviewService) private readonly documents: DriverDocumentReviewService) {}

  @Get('review-queue')
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'Cookie')
  queue(@Headers('cookie') cookie: string | undefined) {
    return this.documents.reviewQueue(cookie);
  }

  @Get('business/:businessId')
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'Cookie')
  list(
    @Headers('cookie') cookieHeader: string | undefined,
    @Param('businessId') businessId: string
  ) {
    return this.documents.list(cookieHeader, businessId).then(documents => ({ documents }));
  }

  @Get(':id/content')
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'Cookie')
  async read(
    @Headers('cookie') cookieHeader: string | undefined,
    @Param('id') id: string
  ): Promise<StreamableFile> {
    const asset = await this.documents.read(cookieHeader, id);
    return new StreamableFile(asset.data, { type: asset.mimeType });
  }

  @Post(':id/review')
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'Cookie')
  review(
    @Headers('cookie') cookieHeader: string | undefined,
    @Param('id') id: string,
    @Body() body: { status?: unknown; reason?: unknown }
  ) {
    return this.documents.review(cookieHeader, id, body?.status, body?.reason).then(review => ({ review }));
  }
}
