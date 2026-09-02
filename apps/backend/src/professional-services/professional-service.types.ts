export type RequestStatus = 'open'|'offer_selected'|'in_progress'|'completion_pending'|'completed'|'cancelled'|'disputed';
export type JobAction = 'start'|'request_completion'|'confirm_completion'|'cancel'|'dispute';
export interface ProfessionalRequest {
  id:string; customerUserId:string; categoryCode:string; titleAr:string; descriptionAr:string;
  urgency:'urgent'|'today'|'scheduled'; scheduledFor?:string; budgetMin?:number; budgetMax?:number;
  currency:'SYP'|'USD'; address:string; areaLabel:string; latitude:number; longitude:number; customerPhone:string;
  status:RequestStatus; acceptedOfferId?:string; paymentMethod?:'cash'; paymentStatus?:'pending'|'cash_collected'; expiresAt:string; completedAt?:string; createdAt:string; updatedAt:string;
}
export interface ProfessionalOffer {
  id:string; requestId:string; providerBusinessId:string; providerName?:string; inspectionFee:number; laborFee:number;
  materialsFee?:number; total:number; currency:'SYP'|'USD'; arrivalMinutes:number; durationMinutes:number;
  warrantyDays:number; scopeAr:string; exclusionsAr?:string; status:'submitted'|'accepted'|'rejected'|'withdrawn'; createdAt:string;
}
