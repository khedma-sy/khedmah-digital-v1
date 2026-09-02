'use client';
import { useState } from 'react';
import { api,KhedmahPromotion } from '../../lib/api-client';
import { ActionButton,StatusMessage,Surface } from '../components/ui-primitives';
export function PromotionCard({promotion}:{promotion:KhedmahPromotion}){
 const[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const price=(n:number)=>`${n.toLocaleString('ar-SY',{maximumFractionDigits:2})} ${promotion.currency}`;
 async function claim(){setBusy(true);setMessage('');try{const{claim}=await api.promotions.claim(promotion.id);setMessage(`رمز الاستفادة: ${claim.redemptionCode} — صالح حتى ${new Date(claim.expiresAt).toLocaleString('ar-SY')}`)}catch(c){const e=c as Error&{statusCode?:number};setMessage(e.statusCode===401?'سجّل الدخول أولًا للحصول على رمز الاستفادة.':e.message||'تعذر حجز العرض.')}finally{setBusy(false)}}
 return <Surface as="article"><span className="ui-eyebrow">{promotion.businessName}</span><h2>{promotion.titleAr}</h2><p>{promotion.descriptionAr}</p><p><del>{price(promotion.originalPrice)}</del> <strong>{price(promotion.finalPrice)}</strong> · {promotion.discountType==='percentage'?`خصم ${promotion.discountValue.toLocaleString('ar-SY')}٪`:`توفير ${price(promotion.discountValue)}`}</p><small>ينتهي {new Date(promotion.endsAt).toLocaleDateString('ar-SY')} · المتبقي {(promotion.totalLimit-promotion.redeemedCount).toLocaleString('ar-SY')}</small><div className="ui-page-actions"><ActionButton onClick={()=>void claim()} disabled={busy}>{busy?'جارٍ الحجز…':'احصل على رمز الاستفادة'}</ActionButton></div>{message&&<StatusMessage tone={message.startsWith('رمز')?'success':message.startsWith('سجّل')?'warning':'danger'}>{message}</StatusMessage>}</Surface>;
}
