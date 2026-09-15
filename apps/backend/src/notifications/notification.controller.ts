import { Controller, Get, Header, Headers, Inject, Param, Patch, Query } from '@nestjs/common';
import { NotificationService } from './notification.service';

@Controller('notifications')
export class NotificationController {
  constructor(@Inject(NotificationService) private readonly notifications: NotificationService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'Cookie')
  list(@Headers('cookie') cookie: string | undefined, @Query('limit') limit?: string) {
    return this.notifications.list(cookie, limit);
  }

  @Patch('read-all')
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'Cookie')
  async readAll(@Headers('cookie') cookie: string | undefined) {
    return { updated: await this.notifications.markAllRead(cookie) };
  }

  @Patch(':id/read')
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'Cookie')
  async read(@Headers('cookie') cookie: string | undefined, @Param('id') id: string) {
    await this.notifications.markRead(cookie, id);
    return { read: true };
  }
}
