import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { OperationsAuditRecord, OperationsChange } from './operations-product.types';
export interface IncidentRecord { readonly id: string; readonly title: string; readonly severity: string; readonly summary: string; readonly status: 'open'; readonly createdAt: string; }
@Injectable()
export class OperationsProductRepository {
  private readonly changes: OperationsChange[] = [];
  private readonly audits: OperationsAuditRecord[] = [];
  private readonly incidents: IncidentRecord[] = [];
  saveChange(change: OperationsChange) { this.changes.unshift(change); }
  listChanges() { return [...this.changes]; }
  saveIncident(input: Omit<IncidentRecord, 'id' | 'status' | 'createdAt'>) {
    const incident = { ...input, id: randomUUID(), status: 'open' as const, createdAt: new Date().toISOString() }; this.incidents.unshift(incident); return incident;
  }
  listIncidents() { return [...this.incidents]; }
  audit(record: Omit<OperationsAuditRecord, 'id' | 'occurredAt'>) { this.audits.unshift({ ...record, id: randomUUID(), occurredAt: new Date().toISOString() }); }
  listAudit() { return [...this.audits]; }
}
