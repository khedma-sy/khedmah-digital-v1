import { AnalyticsEventRecord } from './analytics.types';
export declare class AnalyticsRepository {
    private readonly events;
    saveEvent(event: AnalyticsEventRecord): void;
    findEvent(id: string): AnalyticsEventRecord | undefined;
    listEvents(): AnalyticsEventRecord[];
}
