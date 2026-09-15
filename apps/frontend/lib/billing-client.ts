export interface BillingPlan { code:string; nameAr:string; billingCycle:'monthly'|'annual'; durationMonths:number; priceMinor:number; pointsGranted:number; features:string[] }
export interface BillingOrder { id:string; planCode:string; amountMinor:number; discountMinor:number; totalMinor:number; currency:'SYP'; currencyEra:'SYP_NEW_2026'; promoCode?:string; status:'pending'|'paid'|'cancelled'|'expired'; externalReference?:string; createdAt:string; paidAt?:string }
export interface BillingQuote { plan:BillingPlan; promo?:{code:string;percentageOff:number;messageAr:string}; amountMinor:number; discountMinor:number; totalMinor:number }
export interface BillingAccount { pointsAvailable:number; orders:BillingOrder[]; subscriptions:Array<{id:string;planCode:string;status:string;periodEnd:string}> }
export const billingMoney = (minor:number) => `${(minor/100).toLocaleString('ar-SY-u-nu-latn',{maximumFractionDigits:2})} ل.س جديدة`;
export const billingStatus = (status:BillingOrder['status']) => ({pending:'بانتظار السداد والمراجعة',paid:'تم تأكيد السداد',cancelled:'ملغى',expired:'منتهي'})[status];
export function billingError(error:unknown):string {
  const message=error instanceof Error?error.message:'';
  if(/invalid or expired|expired before/.test(message))return 'كود الخصم غير صالح أو انتهت صلاحيته. راجع السعر مجددًا.';
  if(/already used|already redeemed|redemption limit/.test(message))return 'استُنفد الحد المتاح لاستخدام كود الخصم.';
  if(/quoted total changed/.test(message))return 'تغير السعر؛ راجع الإجمالي مجددًا قبل إنشاء الطلب.';
  if(/reference already belongs/.test(message))return 'مرجع السداد مستخدم لطلب آخر؛ لا يمكن احتساب المبلغ مرتين.';
  if(/different payment reference/.test(message))return 'أُكد هذا الطلب بمرجع سداد مختلف.';
  if(/review attestation/.test(message))return 'يجب الإقرار بمطابقة السداد قبل تأكيده.';
  if(/amount or currency does not match/.test(message))return 'تغيرت بيانات الطلب؛ حدّث القائمة وطابق المبلغ والعملة مجددًا.';
  if(/separate billing administrator/.test(message))return 'يجب أن يراجع هذا السداد مسؤول فوترة آخر.';
  if(/access denied/.test(message))return 'هذا الحساب لا يملك صلاحية مراجعة المدفوعات.';
  return 'تعذر إتمام العملية. حدّث البيانات وأعد المحاولة؛ لا يُعد الطلب مدفوعًا حتى يظهر تأكيد السداد.';
}
async function request<T>(path:string,init?:RequestInit):Promise<T>{
  const response=await fetch(`/api/v1${path}`,{...init,cache:'no-store',credentials:'include',headers:{'Content-Type':'application/json',...init?.headers}});
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(new Error(Array.isArray(body.message)?body.message.join('. '):body.message??'Billing request failed'),{statusCode:response.status});
  return body as T;
}
const post=(body:unknown):RequestInit=>({method:'POST',body:JSON.stringify(body)});
export const billingApi={
  plans:()=>request<{plans:BillingPlan[]}>('/billing/plans'),
  me:()=>request<{billing:BillingAccount}>('/billing/me'),
  promotion:()=>request<{promotion:null|{code:string;messageAr:string;eligible:boolean;validUntil:string}}>('/billing/promo/active'),
  quote:(planCode:string,promoCode:string)=>request<BillingQuote>('/billing/quote',post({planCode,promoCode})),
  create:(planCode:string,promoCode:string,requestId:string,expectedTotalMinor:number)=>request<{order:BillingOrder}>('/billing/orders',post({planCode,promoCode,requestId,expectedTotalMinor})),
  cancel:(id:string)=>request<{order:BillingOrder}>(`/billing/orders/${encodeURIComponent(id)}/cancel`,post({})),
  pending:()=>request<{orders:BillingOrder[]}>('/admin/billing/orders/pending'),
  markPaid:(order:BillingOrder,externalReference:string,attested:boolean)=>request<{order:BillingOrder}>(`/admin/billing/orders/${encodeURIComponent(order.id)}/mark-paid`,post({externalReference,attested,confirmedTotalMinor:order.totalMinor,confirmedCurrency:order.currency,confirmedCurrencyEra:order.currencyEra}))
};
