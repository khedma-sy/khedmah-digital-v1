import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { IdentityService } from '../identity/identity.service';
import { readSessionToken } from '../identity/session-cookie';
import { NotificationRepository } from './notification.repository';
import type { PublishNotification } from './notification.types';

@Injectable()
export class NotificationService {
  constructor(
    @Inject(NotificationRepository) private readonly repository: NotificationRepository,
    @Inject(IdentityService) private readonly identity: IdentityService
  ) {}

  publish(input: PublishNotification): Promise<void> { return this.repository.publish(input); }

  async list(cookie: string | undefined, rawLimit?: string) {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookie));
    const limit = rawLimit === undefined ? 30 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new BadRequestException('limit must be between 1 and 100.');
    const [notifications, unreadCount] = await Promise.all([
      this.repository.list(actor.id, limit), this.repository.unreadCount(actor.id)
    ]);
    return { notifications, unreadCount };
  }

  async markRead(cookie: string | undefined, id: string): Promise<void> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookie));
    if (!await this.repository.markRead(actor.id, id)) throw new NotFoundException('Notification was not found.');
  }

  async markAllRead(cookie: string | undefined): Promise<number> {
    const actor = await this.identity.getCurrentUser(readSessionToken(cookie));
    return this.repository.markAllRead(actor.id);
  }
}
