import { Injectable } from '@nestjs/common';
import { AnalyticsEventRecord } from './analytics.types';

@Injectable()
export class AnalyticsRepository {
  private readonly events = new Map<string, AnalyticsEventRecord>();

  saveEvent(event: AnalyticsEventRecord): void {
    this.events.set(event.id, event);
  }

  findEvent(id: string): AnalyticsEventRecord | undefined {
    return this.events.get(id);
  }

  listEvents(): AnalyticsEventRecord[] {
    return [...this.events.values()];
  }
}
