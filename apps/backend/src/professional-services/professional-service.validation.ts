import { BadRequestException } from '@nestjs/common';
const text=(v:unknown,n:string,min:number,max:number)=>{if(typeof v!=='string'||v.trim().length<min||v.trim().length>max)throw new BadRequestException(`${n} is invalid.`);return v.trim()};
const number=(v:unknown,n:string,min:number,max:number)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw new BadRequestException(`${n} is invalid.`);return v};
export function validateRequest(v:Record<string,unknown>){
 const urgency=v.urgency;if(!['urgent','today','scheduled'].includes(String(urgency)))throw new BadRequestException('urgency is invalid.');
 const scheduledFor=urgency==='scheduled'?text(v.scheduledFor,'scheduledFor',10,40):undefined;
 const currency=v.currency??'SYP';if(!['SYP','USD'].includes(String(currency)))throw new BadRequestException('currency is invalid.');
 const budgetMin=v.budgetMin===undefined?undefined:number(v.budgetMin,'budgetMin',0,1e12),budgetMax=v.budgetMax===undefined?undefined:number(v.budgetMax,'budgetMax',0,1e12);
 if(budgetMin!==undefined&&budgetMax!==undefined&&budgetMax<budgetMin)throw new BadRequestException('budget range is invalid.');
 return {categoryCode:text(v.categoryCode,'categoryCode',2,80),titleAr:text(v.titleAr,'titleAr',4,160),descriptionAr:text(v.descriptionAr,'descriptionAr',10,2000),urgency:urgency as 'urgent'|'today'|'scheduled',scheduledFor,budgetMin,budgetMax,currency:currency as 'SYP'|'USD',address:text(v.address,'address',5,300),areaLabel:text(v.areaLabel,'areaLabel',2,120),latitude:number(v.latitude,'latitude',-90,90),longitude:number(v.longitude,'longitude',-180,180),customerPhone:text(v.customerPhone,'customerPhone',6,30)};
}
export function validateOffer(v:Record<string,unknown>){
 const currency=v.currency??'SYP';if(!['SYP','USD'].includes(String(currency)))throw new BadRequestException('currency is invalid.');
 return {inspectionFee:number(v.inspectionFee??0,'inspectionFee',0,1e12),laborFee:number(v.laborFee,'laborFee',0,1e12),materialsFee:v.materialsFee===undefined?undefined:number(v.materialsFee,'materialsFee',0,1e12),currency:currency as 'SYP'|'USD',arrivalMinutes:number(v.arrivalMinutes,'arrivalMinutes',1,10080),durationMinutes:number(v.durationMinutes,'durationMinutes',1,43200),warrantyDays:number(v.warrantyDays??0,'warrantyDays',0,3650),scopeAr:text(v.scopeAr,'scopeAr',10,1200),exclusionsAr:v.exclusionsAr===undefined?undefined:text(v.exclusionsAr,'exclusionsAr',1,800)};
}
export function validateAction(v:Record<string,unknown>){const action=String(v.action);if(!['start','request_completion','confirm_completion','cancel','dispute'].includes(action))throw new BadRequestException('action is invalid.');return {action:action as import('./professional-service.types').JobAction,note:v.note===undefined?undefined:text(v.note,'note',2,500)};}
