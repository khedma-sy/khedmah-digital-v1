export interface TaxiPricingConfig {openingFareMinor:number;perKmMinor:number;waitPerMinuteMinor:number;bookingFeeMinor:number;minimumFareMinor:number;demandMultiplierBps:number;maxAmountMinor:number;quoteTtlMs:number}
export interface TaxiPricingRevision extends TaxiPricingConfig {id:string;zoneCode:string;revision:number;reason:string;createdBy:string;createdAt:string}
export interface TaxiPricingState {zoneCode:string;revision:TaxiPricingRevision|null;activeRevision:number|null;synchronized:boolean}
export interface TaxiFareSimulation {openingAfterDemandMinor:number;bookingFeeMinor:number;distanceMinor:number;waitingMinor:number;minimumAdjustmentMinor:number;totalMinor:number}
async function request<T>(path:string,body?:unknown):Promise<T>{
  const response=await fetch(`/api/v1/taxi/admin/pricing${path}`,{method:body===undefined?'GET':'POST',cache:'no-store',credentials:'include',headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(new Error(result.message??'Taxi pricing request failed'),{statusCode:response.status});
  return result as T;
}
export const taxiPricingApi={
  current:(zone:string)=>request<TaxiPricingState>(`/current?zone=${encodeURIComponent(zone)}`),
  history:(zone:string)=>request<{revisions:TaxiPricingRevision[]}>(`/history?zone=${encodeURIComponent(zone)}`),
  simulate:(config:TaxiPricingConfig,distanceMeters:number,waitSeconds:number)=>request<TaxiFareSimulation>('/simulate',{...config,distanceMeters,waitSeconds}),
  save:(zoneCode:string,config:TaxiPricingConfig,reason:string,expectedRevision:number)=>request<{pricing:TaxiPricingRevision}>('/revisions',{...config,zoneCode,reason,expectedRevision,currency:'SYP'})
};
