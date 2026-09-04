'use client';
import { useState } from 'react';
import { api,KhedmahPromotion } from '../../lib/api-client';
import { ActionButton,StatusMessage,Surface } from '../components/ui-primitives';
import { PlatformIcon } from '../components/platform-icon';
import styles from './promotions.module.css';
export function PromotionCard({promotion}:{promotion:KhedmahPromotion}){
 const[result,setResult]=useState<{tone:'success'|'warning'|'danger';text:string}|null>(null),[busy,setBusy]=useState(false);
 const available=Math.max(0,promotion.totalLimit-promotion.redeemedCount);
 const currency=promotion.currency==='SYP'?'ل.س':'دولار';
 const price=(n:number)=>`${n.toLocaleString('ar-SY',{maximumFractionDigits:2})} ${currency}`;
 const discount=promotion.discountType==='percentage'?`خصم ${promotion.discountValue.toLocaleString('ar-SY')}٪`:`توفير ${price(promotion.discountValue)}`;
 async function claim(){setBusy(true);setResult(null);try{const{claim}=await api.promotions.claim(promotion.id);setResult({tone:'success',text:`رمزك: ${claim.redemptionCode} — صالح حتى ${new Date(claim.expiresAt).toLocaleString('ar-SY')}`})}catch(c){const e=c as Error&{statusCode?:number};setResult({tone:e.statusCode===401?'warning':'danger',text:e.statusCode===401?'سجّل الدخول أولًا لحجز رمز العرض.':e.message||'تعذر حجز العرض.'})}finally{setBusy(false)}}
 return <Surface as="article" className={styles.promotionCard}>
  <div className={styles.cardHeading}><span className={styles.cardIcon}><PlatformIcon name="tag" size={22}/></span><div><span className={styles.businessName}>{promotion.businessName}</span><h2>{promotion.titleAr}</h2></div><span className={styles.discountBadge}>{discount}</span></div>
  <p className={styles.cardDescription}>{promotion.descriptionAr}</p>
  <div className={styles.priceComparison} aria-label={`السعر بعد الخصم ${price(promotion.finalPrice)}`}><div><span>قبل الخصم</span><del>{price(promotion.originalPrice)}</del></div><PlatformIcon name="arrow" size={20}/><div className={styles.finalPrice}><span>سعر العرض</span><strong>{price(promotion.finalPrice)}</strong></div></div>
  <div className={styles.cardMeta}><span><PlatformIcon name="ticket" size={16}/>متبقٍ {available.toLocaleString('ar-SY')} رمز</span><span>ينتهي {new Date(promotion.endsAt).toLocaleDateString('ar-SY')}</span></div>
  <ActionButton onClick={()=>void claim()} disabled={busy||available===0}><PlatformIcon name="ticket" size={18}/>{available===0?'نفدت رموز العرض':busy?'جارٍ الحجز…':'احجز رمز العرض'}</ActionButton>
  {result&&<StatusMessage tone={result.tone}>{result.text}</StatusMessage>}
 </Surface>;
}
