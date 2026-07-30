import { OperationsAuditRecord, OperationsChange } from './operations-product.types';
export interface IncidentRecord {
    readonly id: string;
    readonly title: string;
    readonly severity: string;
    readonly summary: string;
    readonly status: 'open';
    readonly createdAt: string;
}
export declare class OperationsProductRepository {
    private readonly changes;
    private readonly audits;
    private readonly incidents;
    saveChange(change: OperationsChange): void;
    listChanges(): OperationsChange[];
    saveIncident(input: Omit<IncidentRecord, 'id' | 'status' | 'createdAt'>): {
        id: `${string}-${string}-${string}-${string}-${string}`;
        status: "open";
        createdAt: string;
        title: string;
        severity: string;
        summary: string;
    };
    listIncidents(): IncidentRecord[];
    audit(record: Omit<OperationsAuditRecord, 'id' | 'occurredAt'>): void;
    listAudit(): OperationsAuditRecord[];
}
