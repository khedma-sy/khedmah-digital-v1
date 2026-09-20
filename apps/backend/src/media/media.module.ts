import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { IdentityModule } from '../identity/identity.module';
import { OperationsProductModule } from '../operations-product/operations-product.module';
import { DriverDocumentReviewController } from './driver-document-review.controller';
import { DriverDocumentReviewService } from './driver-document-review.service';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';

@Module({
  imports: [DatabaseModule, IdentityModule, OperationsProductModule],
  controllers: [MediaController, DriverDocumentReviewController],
  providers: [MediaService, DriverDocumentReviewService],
  exports: [MediaService, DriverDocumentReviewService]
})
export class MediaModule {}
