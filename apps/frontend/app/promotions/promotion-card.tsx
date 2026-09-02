'use client';
import { useState } from 'react';
import { api,KhedmahPromotion } from '../../lib/api-client';
import { ActionButton,StatusMessage,Surface } from '../components/ui-primitives';
import { PlatformIcon } from '../components/platform-icon';
import styles from './promotions.module.css';
export function PromotionCard({promotion}:{promotion:KhedmahPromotion}){
 const[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const price=(n:number)=>`${n.toLocaleString('ar-SY',{maximumFractionDigits:2})} ${promotion.currency}`;
 async function claim(){setBusy(true);setMessage('');try{const{claim}=await api.promotions.claim(promotion.id);setMessage(`رمز الاستفادة: ${claim.redemptionCode} — صالح حتى ${new Date(claim.expiresAt).toLocaleString('ar-SY')}`)}catch(c){const e=c as Error&{statusCode?:number};setMessage(e.statusCode===401?'سجّل الدخول أولًا للحصول على رمز الاستفادة.':e.message||'تعذر حجز العرض.')}finally{setBusy(false)}}
 return <Surface as="article" className={styles.promotionCard}><div className={styles.cardHeading}><span className={styles.cardIcon}><PlatformIcon name="tag" size={22}/></span><div><span className="ui-eyebrow">{promotion.businessName}</span><h2>{promotion.titleAr}</h2></div></div><p className={styles.cardDescription}>{promotion.descriptionAr}</p><div className={styles.priceRow}><del>{price(promotion.originalPrice)}</del><strong>{price(promotion.finalPrice)}</strong><span>{promotion.discountType==='percentage'?`خصم ${promotion.discountValue.toLocaleString('ar-SY')}٪`:`توفير ${price(promotion.discountValue)}`}</span></div><div className={styles.cardMeta}><span>ينتهي {new Date(promotion.endsAt).toLocaleDateString('ar-SY')}</span><span>متبقٍ {(promotion.totalLimit-promotion.redeemedCount).toLocaleString('ar-SY')}</span></div><ActionButton onClick={()=>void claim()} disabled={busy}><PlatformIcon name="tag" size={18}/>{busy?'جارٍ الحجز…':'احصل على رمز الاستفادة'}</ActionButton>{message&&<StatusMessage tone={message.startsWith('رمز')?'success':message.startsWith('سجّل')?'warning':'danger'}>{message}</StatusMessage>}</Surface>;
}
