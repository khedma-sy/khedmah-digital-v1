import { Controller, Get, Headers, Inject, Param, Patch, Query } from '@nestjs/common';
import { NotificationService } from './notification.service';

@Controller('notifications')
export class NotificationController {
  constructor(@Inject(NotificationService) private readonly notifications: NotificationService) {}

  @Get()
  list(@Headers('cookie') cookie: string | undefined, @Query('limit') limit?: string) {
    return this.notifications.list(cookie, limit);
  }

  @Patch('read-all')
  async readAll(@Headers('cookie') cookie: string | undefined) {
    return { updated: await this.notifications.markAllRead(cookie) };
  }

  @Patch(':id/read')
  async read(@Headers('cookie') cookie: string | undefined, @Param('id') id: string) {
    await this.notifications.markRead(cookie, id);
    return { read: true };
  }
}
