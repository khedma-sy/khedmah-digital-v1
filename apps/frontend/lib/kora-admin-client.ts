'use client';

export type KoraMetricStatus='available'|'process_local'|'not_instrumented';
export type KoraSeverity='low'|'medium'|'high'|'critical';
export interface KoraMetric{key:string;label:string;status:KoraMetricStatus;source:string;window:string;measuredAt:string;value?:number;note?:string}
export interface KoraFinding{id:string;kind:'operational_anomaly'|'ui_failure'|'telemetry_gap'|'incident';resource:string;title:string;summary:string;severity:KoraSeverity;evidence:string;source:string;detectedAt:string}
export interface KoraTask{id:string;title:string;summary:string;priority:'P0'|'P1'|'P2'|'P3';resource:string;sourceFindingKind:KoraFinding['kind'];evidence:string;suggestedAction:string;approvalRequired:boolean;autoExecutable:false;createdAt:string}
export interface KoraExecutive{mode:'executive';operatingMode:'supervised';whatHappened:KoraMetric[];problemCount:number;riskLevel:KoraSeverity;recommendations:string[];needsOwnerDecision:boolean;evidenceBoundary:string}
export interface KoraExpose{mode:'expose';operatingMode:'supervised';confirmedUiFailures:KoraFinding[];uiChecks:Array<{id:string;label:string;severity:KoraSeverity;status:string;note:string}>;telemetryGaps:KoraMetric[];note:string}

async function request<T>(path:string,init?:RequestInit):Promise<T>{
  const response=await fetch(`/api/v1/admin/kora${path}`,{...init,credentials:'include',headers:{'Content-Type':'application/json',...init?.headers}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){const raw=(data as {message?:string|string[]}).message??`KORA request failed (${response.status})`;throw Object.assign(new Error(Array.isArray(raw)?raw.join('. '):raw),{statusCode:response.status});}
  return data as T;
}

export const koraAdminApi={
  metrics:()=>request<{tool:'read_metrics';metrics:KoraMetric[];truthfulUnavailableValues:true}>('/metrics'),
  anomalies:()=>request<{tool:'review_operational_anomalies';findings:KoraFinding[];coverageGaps:string[];sourceBoundary:string}>('/anomalies'),
  executive:()=>request<KoraExecutive>('/executive'),
  expose:()=>request<KoraExpose>('/expose'),
  draftTask:(data:{kind:KoraFinding['kind'];resource:string;title:string;summary:string;severity:KoraSeverity;evidence:string})=>request<{tool:'draft_admin_tasks';task:KoraTask}>('/tasks/draft',{method:'POST',body:JSON.stringify(data)}),
  killCritic:(data:{action:string;targetEnvironment:'preview'|'staging'|'production'|'platform';impact:KoraSeverity})=>request<{mode:'killcritic';decision:string;questions:string[];automaticExecutionAllowed:false}>('/killcritic',{method:'POST',body:JSON.stringify(data)}),
  autopsy:(data:{title:string;observedAt:string;summary:string;evidence:string})=>request<{mode:'autopsy';rootCause:{status:'undetermined';reason:string};nextEvidence:string[];preventionDecision:string;automaticExecutionAllowed:false}>('/autopsy',{method:'POST',body:JSON.stringify(data)})
};
