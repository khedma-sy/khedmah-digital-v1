import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DatabasePool } from '../database/database.pool';
import type { AdvertisingPackageBlueprint, AdvertisingPolicy } from '../products/product-policy';
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
    const [rows,mobilityRows,professionalRows]=await Promise.all([
      this.db.query<any>(`SELECT o.id,o.vertical,o.status,o.payment_status,o.currency,o.total,o.created_at,o.updated_at,merchant.name merchant_name,courier.name courier_name,(SELECT MAX(l.recorded_at) FROM fulfillment_order_location_updates l WHERE l.order_id=o.id) latest_location_at,(SELECT COUNT(*)::int FROM fulfillment_order_events e WHERE e.order_id=o.id) event_count FROM fulfillment_orders o JOIN business_profiles merchant ON merchant.id=o.merchant_business_id LEFT JOIN business_profiles courier ON courier.id=o.courier_business_id ORDER BY CASE WHEN o.status IN ('delivered','rejected','cancelled') THEN 1 ELSE 0 END,o.updated_at ASC LIMIT 200`),
      this.db.query<any>(`SELECT r.id,r.service_type,r.status,r.updated_at,b.name provider_name,(SELECT COUNT(*)::int FROM mobility_request_events e WHERE e.request_id=r.id) event_count FROM mobility_requests r JOIN business_profiles b ON b.id=r.provider_business_id ORDER BY CASE WHEN r.status IN ('completed','rejected','cancelled') THEN 1 ELSE 0 END,r.updated_at ASC LIMIT 200`),
      this.db.query<any>(`SELECT r.id,r.status,r.updated_at,c.name_ar category_name,b.name provider_name,(r.status='disputed' OR (r.status='completion_pending' AND r.updated_at<NOW()-INTERVAL '24 hours') OR (r.status='open' AND r.expires_at<=NOW())) needs_attention,(SELECT COUNT(*)::int FROM professional_service_offers o WHERE o.request_id=r.id) offer_count,(SELECT COUNT(*)::int FROM professional_service_events e WHERE e.request_id=r.id) event_count FROM professional_service_requests r JOIN categories c ON c.code=r.category_code LEFT JOIN professional_service_offers accepted ON accepted.id=r.accepted_offer_id LEFT JOIN business_profiles b ON b.id=accepted.provider_business_id ORDER BY CASE WHEN r.status IN ('completed','cancelled') THEN 1 ELSE 0 END,r.updated_at ASC LIMIT 200`)
    ]);
    const now=Date.now();const terminal=new Set(['delivered','rejected','cancelled']);
    const orders=rows.map(row=>({id:row.id,vertical:row.vertical,status:row.status,paymentStatus:row.payment_status,currency:row.currency,total:row.total===null?undefined:Number(row.total),merchantName:row.merchant_name,courierName:row.courier_name??undefined,createdAt:new Date(row.created_at).toISOString(),updatedAt:new Date(row.updated_at).toISOString(),latestLocationAt:row.latest_location_at?new Date(row.latest_location_at).toISOString():undefined,eventCount:Number(row.event_count??0),stale:!terminal.has(row.status)&&now-new Date(row.updated_at).getTime()>30*60*1000}));
    const counts:Record<string,number>={};for(const order of orders)counts[order.status]=(counts[order.status]??0)+1;
    const mobilityTerminal=new Set(['completed','rejected','cancelled']);
    const mobility=mobilityRows.map(row=>({id:row.id,serviceType:row.service_type,status:row.status,providerName:row.provider_name,updatedAt:new Date(row.updated_at).toISOString(),eventCount:Number(row.event_count??0),stale:!mobilityTerminal.has(row.status)&&now-new Date(row.updated_at).getTime()>30*60*1000}));
    const professionalTerminal=new Set(['completed','cancelled']);
    const professionalJobs=professionalRows.map(row=>({id:row.id,status:row.status,categoryName:row.category_name,providerName:row.provider_name??undefined,updatedAt:new Date(row.updated_at).toISOString(),offerCount:Number(row.offer_count??0),eventCount:Number(row.event_count??0),needsAttention:Boolean(row.needs_attention)}));
    return{generatedAt:new Date().toISOString(),privacy:{contactDataExposed:false,addressExposed:false,coordinatesExposed:false,userTextExposed:false},summary:{total:orders.length,active:orders.filter(order=>!terminal.has(order.status)).length,stale:orders.filter(order=>order.stale).length,unassigned:orders.filter(order=>!terminal.has(order.status)&&!order.courierName).length,byStatus:counts},orders,mobility:{summary:{total:mobility.length,active:mobility.filter(item=>!mobilityTerminal.has(item.status)).length,stale:mobility.filter(item=>item.stale).length},requests:mobility},professionalJobs:{summary:{total:professionalJobs.length,active:professionalJobs.filter(item=>!professionalTerminal.has(item.status)).length,attention:professionalJobs.filter(item=>item.needsAttention).length},requests:professionalJobs}};
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
  async platformMetrics(){
    const rows=await this.db.query<any>(`SELECT
      (SELECT COUNT(*) FROM core_user_accounts) users_total,
      (SELECT COUNT(*) FROM core_user_accounts WHERE account_status='active') users_active,
      (SELECT COUNT(*) FROM core_user_accounts WHERE account_status='suspended') users_suspended,
      (SELECT COUNT(*) FROM business_profiles) businesses_total,
      (SELECT COUNT(*) FROM business_profiles WHERE status='active' AND moderation_status='approved') businesses_live,
      (SELECT COUNT(*) FROM business_profiles WHERE moderation_status='pending') businesses_pending,
      (SELECT COUNT(*) FROM professional_profiles) professionals_total,
      (SELECT COUNT(*) FROM professional_profiles WHERE lifecycle_status='active' AND moderation_status='approved') professionals_live,
      (SELECT COUNT(*) FROM professional_profiles WHERE moderation_status='pending') professionals_pending,
      (SELECT COUNT(*) FROM organizations) organizations_total,
      (SELECT COUNT(*) FROM organization_members WHERE status='active') organization_members_active,
      (SELECT COUNT(*) FROM locations) locations_total,
      (SELECT COUNT(*) FROM locations WHERE lifecycle_status='active') locations_active,
      (SELECT COUNT(*) FROM categories) categories_total,
      (SELECT COUNT(*) FROM categories WHERE status='active') categories_active,
      (SELECT COUNT(*) FROM service_listings) services_total,
      (SELECT COUNT(*) FROM service_listings WHERE status='active') services_live,
      (SELECT COUNT(*) FROM product_listings) products_total,
      (SELECT COUNT(*) FROM product_listings WHERE status='active' AND moderation_status='approved') products_live,
      (SELECT COUNT(*) FROM product_listings WHERE status='active' AND moderation_status='pending') products_pending,
      (SELECT COUNT(*) FROM promotions) promotions_total,
      (SELECT COUNT(*) FROM promotions WHERE status='active' AND moderation_status='approved' AND starts_at<=NOW() AND ends_at>NOW() AND redeemed_count<total_limit) promotions_live,
      (SELECT COUNT(*) FROM promotions WHERE moderation_status='pending') promotions_pending,
      (SELECT COUNT(*) FROM promotion_claims) promotion_claims_total,
      (SELECT COUNT(*) FROM promotion_claims WHERE status='redeemed') promotion_claims_redeemed,
      (SELECT COUNT(*) FROM fulfillment_orders) orders_total,
      (SELECT COUNT(*) FROM fulfillment_orders WHERE status NOT IN ('delivered','rejected','cancelled')) orders_active,
      (SELECT COUNT(*) FROM fulfillment_orders WHERE status='delivered') orders_delivered,
      (SELECT COUNT(*) FROM fulfillment_orders WHERE status NOT IN ('delivered','rejected','cancelled') AND updated_at<NOW()-INTERVAL '30 minutes') orders_stale,
      (SELECT COUNT(*) FROM fulfillment_orders WHERE status NOT IN ('delivered','rejected','cancelled') AND courier_business_id IS NULL) orders_unassigned,
      (SELECT COUNT(*) FROM mobility_requests) mobility_total,
      (SELECT COUNT(*) FROM mobility_requests WHERE status IN ('requested','accepted','en_route','arrived','in_progress')) mobility_active,
      (SELECT COUNT(*) FROM mobility_requests WHERE status IN ('requested','accepted','en_route','arrived','in_progress') AND updated_at<NOW()-INTERVAL '30 minutes') mobility_stale,
      (SELECT COUNT(*) FROM professional_service_requests) jobs_total,
      (SELECT COUNT(*) FROM professional_service_requests WHERE status IN ('open','offer_selected','in_progress','completion_pending','disputed')) jobs_active,
      (SELECT COUNT(*) FROM professional_service_requests WHERE status='disputed' OR (status='completion_pending' AND updated_at<NOW()-INTERVAL '24 hours') OR (status='open' AND expires_at<=NOW())) jobs_attention,
      (SELECT COUNT(*) FROM professional_service_requests WHERE status='disputed') jobs_disputed,
      (SELECT COUNT(*) FROM professional_service_warranties WHERE status='revisit_requested') warranties_revisit,
      (SELECT COUNT(*) FROM contact_inquiries) inquiries_total,
      (SELECT COUNT(*) FROM contact_inquiries WHERE status<>'closed') inquiries_open,
      (SELECT COUNT(*) FROM contact_inquiries WHERE status<>'closed' AND created_at<NOW()-INTERVAL '24 hours') inquiries_overdue,
      (SELECT COUNT(*) FROM provider_reports) reports_total,
      (SELECT COUNT(*) FROM provider_reports WHERE status IN ('submitted','in_review')) reports_open,
      (SELECT COUNT(*) FROM verification_requests WHERE status='pending') verifications_pending,
      (SELECT COUNT(*) FROM media_assets) media_total,
      (SELECT COUNT(*) FROM media_assets WHERE visibility='public') media_public,
      (SELECT COUNT(*) FROM analytics_events WHERE occurred_at>=NOW()-INTERVAL '30 days') analytics_30d,
      (SELECT COUNT(*) FROM operations_incidents WHERE status<>'resolved') incidents_open`);
    const row=rows[0]??{};const number=(key:string)=>Number(row[key]??0);
    const metrics={users:{total:number('users_total'),active:number('users_active'),suspended:number('users_suspended')},businesses:{total:number('businesses_total'),live:number('businesses_live'),pending:number('businesses_pending')},professionals:{total:number('professionals_total'),live:number('professionals_live'),pending:number('professionals_pending')},teams:{total:number('organizations_total'),activeMembers:number('organization_members_active')},locations:{total:number('locations_total'),active:number('locations_active')},categories:{total:number('categories_total'),active:number('categories_active')},services:{total:number('services_total'),live:number('services_live')},products:{total:number('products_total'),live:number('products_live'),pending:number('products_pending')},promotions:{total:number('promotions_total'),live:number('promotions_live'),pending:number('promotions_pending'),claims:number('promotion_claims_total'),redeemed:number('promotion_claims_redeemed')},orders:{total:number('orders_total'),active:number('orders_active'),delivered:number('orders_delivered'),stale:number('orders_stale'),unassigned:number('orders_unassigned')},mobility:{total:number('mobility_total'),active:number('mobility_active'),stale:number('mobility_stale')},professionalJobs:{total:number('jobs_total'),active:number('jobs_active'),attention:number('jobs_attention'),disputed:number('jobs_disputed'),revisitRequested:number('warranties_revisit')},contactInquiries:{total:number('inquiries_total'),open:number('inquiries_open'),overdue:number('inquiries_overdue')},reports:{total:number('reports_total'),open:number('reports_open')},verifications:{pending:number('verifications_pending')},media:{total:number('media_total'),public:number('media_public')},analytics:{last30Days:number('analytics_30d')},incidents:{open:number('incidents_open')}};
    const domains=[
      domain('identity','managed',metrics.users.total,0),domain('teams','managed',metrics.teams.total,0),domain('providers','governed',metrics.businesses.total+metrics.professionals.total,metrics.businesses.pending+metrics.professionals.pending+metrics.verifications.pending),domain('catalog','managed',metrics.categories.total+metrics.services.total,0),domain('store','governed',metrics.products.total,metrics.products.pending),domain('promotions','governed',metrics.promotions.total,metrics.promotions.pending),domain('fulfillment','monitored',metrics.orders.total,metrics.orders.stale+metrics.orders.unassigned),domain('mobility','monitored',metrics.mobility.total,metrics.mobility.stale),domain('professional_services','monitored',metrics.professionalJobs.total,metrics.professionalJobs.attention+metrics.professionalJobs.revisitRequested),domain('contact_and_trust','governed',metrics.contactInquiries.total+metrics.reports.total,metrics.contactInquiries.overdue+metrics.reports.open),domain('media','governed',metrics.media.total,0),domain('analytics','monitored',metrics.analytics.last30Days,0),domain('operations','managed',metrics.incidents.open,metrics.incidents.open)
    ];
    return{generatedAt:new Date().toISOString(),privacy:{aggregatedOnly:true,personalDataExposed:false},...metrics,domains};
  }
  async contentGovernance(policy:AdvertisingPolicy,plannedPackages:readonly AdvertisingPackageBlueprint[]){
    const rows=await this.db.query<any>(`SELECT
      (SELECT COUNT(*) FROM product_listings WHERE moderation_status='pending') products_pending,
      (SELECT COUNT(*) FROM product_listings WHERE moderation_status='approved') products_approved,
      (SELECT COUNT(*) FROM product_listings WHERE moderation_status='rejected') products_rejected,
      (SELECT COUNT(*) FROM (SELECT owner_user_id FROM product_listings WHERE status<>'inactive' GROUP BY owner_user_id HAVING COUNT(*) >= $1) owners) owners_at_limit,
      (SELECT COUNT(*) FROM promotions WHERE moderation_status='pending') promotions_pending,
      (SELECT COUNT(*) FROM promotions WHERE moderation_status='approved' AND status='active' AND starts_at<=NOW() AND ends_at>NOW()) promotions_live,
      (SELECT COUNT(*) FROM promotions WHERE moderation_status='rejected') promotions_rejected,
      (SELECT COUNT(*) FROM promotion_events WHERE event_type='auto_approved' AND created_at>=NOW()-INTERVAL '30 days') promotions_auto_approved_30d,
      (SELECT COUNT(*) FROM promotion_claims WHERE status='redeemed') promotion_redemptions`,[policy.listingLimitPerUser]);const row=rows[0]??{},n=(key:string)=>Number(row[key]??0);
    return{generatedAt:new Date().toISOString(),productPolicy:{...policy,autoModerationEnabled:true,exceptionsRequireHumanReview:true,plannedPackages},products:{pending:n('products_pending'),approved:n('products_approved'),rejected:n('products_rejected'),ownersAtLimit:n('owners_at_limit')},promotions:{pending:n('promotions_pending'),live:n('promotions_live'),rejected:n('promotions_rejected'),autoApprovedLast30Days:n('promotions_auto_approved_30d'),redemptions:n('promotion_redemptions')}};
  }
  audit(record: Omit<OperationsAuditRecord, 'id' | 'occurredAt'>) { this.audits.unshift({ ...record, id: randomUUID(), occurredAt: new Date().toISOString() }); }
  listAudit() { return [...this.audits]; }
}
function mapIncident(row:any):IncidentRecord{return{id:row.id,title:row.title,summary:row.summary,category:row.category,severity:row.severity,status:row.status,reporterUserId:row.reporter_user_id,assigneeUserId:row.assignee_user_id??undefined,resolutionNote:row.resolution_note??undefined,createdAt:new Date(row.created_at).toISOString(),updatedAt:new Date(row.updated_at).toISOString(),resolvedAt:row.resolved_at?new Date(row.resolved_at).toISOString():undefined};}
function domain(id:string,management:'managed'|'monitored'|'governed',total:number,attention:number){return{id,management,total,attention,state:attention>0?'attention' as const:'clear' as const};}
