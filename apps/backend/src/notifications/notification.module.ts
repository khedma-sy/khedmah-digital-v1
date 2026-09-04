import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { NotificationController } from './notification.controller';
import { NotificationRepository } from './notification.repository';
import { NotificationService } from './notification.service';

@Module({
  imports: [IdentityModule],
  controllers: [NotificationController],
  providers: [NotificationRepository, NotificationService],
  exports: [NotificationService]
})
export class NotificationModule {}
