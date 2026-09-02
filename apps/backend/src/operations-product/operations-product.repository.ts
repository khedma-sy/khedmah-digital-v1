import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DatabasePool } from '../database/database.pool';
import { OperationsAuditRecord, OperationsChange } from './operations-product.types';

export type IncidentStatus = 'open' | 'in_progress' | 'verification' | 'resolved';
export interface IncidentRecord { readonly id:string; readonly title:string; readonly summary:string; readonly category:string; readonly severity:string; readonly status:IncidentStatus; readonly reporterUserId:string; readonly assigneeUserId?:string; readonly resolutionNote?:string; readonly createdAt:string; readonly updatedAt:string; readonly resolvedAt?:string; }

@Injectable()
export class OperationsProductRepository {
  private readonly changes: OperationsChange[] = [];
  private readonly audits: OperationsAuditRecord[] = [];
  constructor(@Inject(DatabasePool) private readonly db: DatabasePool) {}
  saveChange(change: OperationsChange) { this.changes.unshift(change); }
  listChanges() { return [...this.changes]; }
  async saveIncident(input:{title:string;summary:string;category:string;severity:string;reporterUserId:string;requestId?:string;correlationId?:string}) {
    const id=randomUUID();
    await this.db.transaction(async(client)=>{
      await client.query(`INSERT INTO operations_incidents(id,title,summary,category,severity,reporter_user_id) VALUES($1,$2,$3,$4,$5,$6)`,[id,input.title,input.summary,input.category,input.severity,input.reporterUserId]);
      await client.query(`INSERT INTO operations_incident_events(id,incident_id,actor_user_id,event_type,new_status,note,request_id,correlation_id) VALUES($1,$2,$3,'created','open',$4,$5,$6)`,[randomUUID(),id,input.reporterUserId,input.summary,input.requestId??null,input.correlationId??null]);
    });
    return (await this.findIncident(id))!;
  }
  async listIncidents(limit=100) { const rows=await this.db.query<any>(`SELECT * FROM operations_incidents ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, created_at DESC LIMIT $1`,[limit]);return rows.map(mapIncident); }
  async countOpenIncidents(){const rows=await this.db.query<{count:string}>(`SELECT COUNT(*)::text count FROM operations_incidents WHERE status<>'resolved'`);return Number(rows[0]?.count??0);}
  async findIncident(id:string){const rows=await this.db.query<any>(`SELECT * FROM operations_incidents WHERE id=$1 LIMIT 1`,[id]);return rows[0]?mapIncident(rows[0]):undefined;}
  async transitionIncident(input:{id:string;actorUserId:string;status:IncidentStatus;note:string;assigneeUserId?:string;requestId?:string;correlationId?:string}){
    return this.db.transaction(async(client)=>{
      const locked=await client.query<any>(`SELECT * FROM operations_incidents WHERE id=$1 FOR UPDATE`,[input.id]);const current=locked.rows[0];if(!current)return undefined;
      const allowed:Record<IncidentStatus,IncidentStatus[]>={open:['in_progress'],in_progress:['verification'],verification:['resolved','in_progress'],resolved:['open']};
      if(!allowed[current.status as IncidentStatus].includes(input.status))throw new Error('INVALID_INCIDENT_TRANSITION');
      const assignee=input.assigneeUserId??current.assignee_user_id;if(input.status==='in_progress'&&!assignee)throw new Error('INCIDENT_ASSIGNEE_REQUIRED');
      const eventType=input.status==='in_progress'?(current.status==='verification'?'reopened':'started'):input.status==='verification'?'sent_to_verification':input.status==='resolved'?'resolved':'reopened';
      const updated=await client.query<any>(`UPDATE operations_incidents SET status=$2,assignee_user_id=$3,resolution_note=CASE WHEN $2='resolved' THEN $4 ELSE resolution_note END,resolved_at=CASE WHEN $2='resolved' THEN NOW() ELSE NULL END,updated_at=NOW() WHERE id=$1 RETURNING *`,[input.id,input.status,assignee??null,input.note]);
      await client.query(`INSERT INTO operations_incident_events(id,incident_id,actor_user_id,event_type,previous_status,new_status,note,request_id,correlation_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[randomUUID(),input.id,input.actorUserId,eventType,current.status,input.status,input.note,input.requestId??null,input.correlationId??null]);
      return mapIncident(updated.rows[0]);
    });
  }
  audit(record: Omit<OperationsAuditRecord, 'id' | 'occurredAt'>) { this.audits.unshift({ ...record, id: randomUUID(), occurredAt: new Date().toISOString() }); }
  listAudit() { return [...this.audits]; }
}
function mapIncident(row:any):IncidentRecord{return{id:row.id,title:row.title,summary:row.summary,category:row.category,severity:row.severity,status:row.status,reporterUserId:row.reporter_user_id,assigneeUserId:row.assignee_user_id??undefined,resolutionNote:row.resolution_note??undefined,createdAt:new Date(row.created_at).toISOString(),updatedAt:new Date(row.updated_at).toISOString(),resolvedAt:row.resolved_at?new Date(row.resolved_at).toISOString():undefined};}
