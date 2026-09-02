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
  async orderMonitor(){
    const rows=await this.db.query<any>(`SELECT o.id,o.vertical,o.status,o.payment_status,o.currency,o.total,o.created_at,o.updated_at,merchant.name_ar merchant_name,courier.name_ar courier_name,l.recorded_at latest_location_at,(SELECT COUNT(*)::int FROM fulfillment_order_events e WHERE e.order_id=o.id) event_count FROM fulfillment_orders o JOIN business_profiles merchant ON merchant.id=o.merchant_business_id LEFT JOIN business_profiles courier ON courier.id=o.courier_business_id LEFT JOIN fulfillment_order_location_updates l ON l.order_id=o.id ORDER BY CASE WHEN o.status IN ('delivered','rejected','cancelled') THEN 1 ELSE 0 END,o.updated_at ASC LIMIT 200`);
    const now=Date.now();const terminal=new Set(['delivered','rejected','cancelled']);
    const orders=rows.map(row=>({id:row.id,vertical:row.vertical,status:row.status,paymentStatus:row.payment_status,currency:row.currency,total:row.total===null?undefined:Number(row.total),merchantName:row.merchant_name,courierName:row.courier_name??undefined,createdAt:new Date(row.created_at).toISOString(),updatedAt:new Date(row.updated_at).toISOString(),latestLocationAt:row.latest_location_at?new Date(row.latest_location_at).toISOString():undefined,eventCount:Number(row.event_count??0),stale:!terminal.has(row.status)&&now-new Date(row.updated_at).getTime()>30*60*1000}));
    const counts:Record<string,number>={};for(const order of orders)counts[order.status]=(counts[order.status]??0)+1;
    return{generatedAt:new Date().toISOString(),privacy:{contactDataExposed:false,addressExposed:false,coordinatesExposed:false},summary:{total:orders.length,active:orders.filter(order=>!terminal.has(order.status)).length,stale:orders.filter(order=>order.stale).length,unassigned:orders.filter(order=>!terminal.has(order.status)&&!order.courierName).length,byStatus:counts},orders};
  }
  async catalogMonitor(){
    const rows=await this.db.query<any>(`SELECT c.code,c.name_ar,c.name_en,c.parent_code,c.status,c.is_featured,c.sort_order,(SELECT COUNT(*)::int FROM business_profiles b WHERE b.category_code=c.code) business_count,(SELECT COUNT(*)::int FROM business_profiles b WHERE b.category_code=c.code AND b.status='active' AND b.moderation_status='approved') live_business_count,(SELECT COUNT(*)::int FROM service_listings s WHERE s.category_code=c.code) service_count,(SELECT COUNT(*)::int FROM service_listings s WHERE s.category_code=c.code AND s.status='active') live_service_count,(SELECT COUNT(*)::int FROM product_listings p WHERE p.category_code=c.code) product_count,(SELECT COUNT(*)::int FROM product_listings p WHERE p.category_code=c.code AND p.status='active' AND p.moderation_status='approved') live_product_count,(SELECT COUNT(*)::int FROM categories child WHERE child.parent_code=c.code AND child.status='active') active_child_count FROM categories c ORDER BY c.sort_order,c.name_ar,c.code`);
    const categories=rows.map(row=>({code:row.code,nameAr:row.name_ar,nameEn:row.name_en??undefined,parentCode:row.parent_code??undefined,status:row.status,isFeatured:row.is_featured,sortOrder:Number(row.sort_order),businessCount:Number(row.business_count),liveBusinessCount:Number(row.live_business_count),serviceCount:Number(row.service_count),liveServiceCount:Number(row.live_service_count),productCount:Number(row.product_count),liveProductCount:Number(row.live_product_count),activeChildCount:Number(row.active_child_count),canDeactivate:Number(row.live_business_count)+Number(row.live_service_count)+Number(row.live_product_count)+Number(row.active_child_count)===0}));
    return{summary:{total:categories.length,active:categories.filter(item=>item.status==='active').length,inactive:categories.filter(item=>item.status==='inactive').length,used:categories.filter(item=>item.businessCount+item.serviceCount+item.productCount>0).length},categories};
  }
  async changeCategoryStatus(input:{code:string;status:'active'|'inactive';reason:string;actorUserId:string;requestId?:string;correlationId?:string}){
    return this.db.transaction(async client=>{const locked=await client.query<any>(`SELECT code,status FROM categories WHERE code=$1 FOR UPDATE`,[input.code]);const current=locked.rows[0];if(!current)return undefined;if(current.status===input.status)throw new Error('CATEGORY_STATUS_UNCHANGED');if(input.status==='inactive'){const blockers=await client.query<any>(`SELECT (SELECT COUNT(*) FROM business_profiles WHERE category_code=$1 AND status='active' AND moderation_status='approved')+(SELECT COUNT(*) FROM service_listings WHERE category_code=$1 AND status='active')+(SELECT COUNT(*) FROM product_listings WHERE category_code=$1 AND status='active' AND moderation_status='approved')+(SELECT COUNT(*) FROM categories WHERE parent_code=$1 AND status='active') total`,[input.code]);if(Number(blockers.rows[0]?.total??0)>0)throw new Error('CATEGORY_HAS_LIVE_USAGE');}
      await client.query(`UPDATE categories SET status=$2,updated_at=NOW() WHERE code=$1`,[input.code,input.status]);await client.query(`INSERT INTO admin_catalog_actions(id,category_code,actor_user_id,action,reason,previous_status,new_status,request_id,correlation_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[randomUUID(),input.code,input.actorUserId,input.status==='active'?'activated':'deactivated',input.reason,current.status,input.status,input.requestId??null,input.correlationId??null]);return{code:input.code,previousStatus:current.status,status:input.status};});
  }
  audit(record: Omit<OperationsAuditRecord, 'id' | 'occurredAt'>) { this.audits.unshift({ ...record, id: randomUUID(), occurredAt: new Date().toISOString() }); }
  listAudit() { return [...this.audits]; }
}
function mapIncident(row:any):IncidentRecord{return{id:row.id,title:row.title,summary:row.summary,category:row.category,severity:row.severity,status:row.status,reporterUserId:row.reporter_user_id,assigneeUserId:row.assignee_user_id??undefined,resolutionNote:row.resolution_note??undefined,createdAt:new Date(row.created_at).toISOString(),updatedAt:new Date(row.updated_at).toISOString(),resolvedAt:row.resolved_at?new Date(row.resolved_at).toISOString():undefined};}
