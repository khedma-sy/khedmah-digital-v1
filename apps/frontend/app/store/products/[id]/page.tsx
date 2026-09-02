'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, type ProductListing } from '../../../../lib/api-client';
import { ActionButton, ActionLink, EmptyState, PageHeader, PageShell, SkeletonGrid, Surface } from '../../../components/ui-primitives';
import { PlatformIcon } from '../../../components/platform-icon';
import styles from '../../store.module.css';
import { buildKhedmaShareText } from '../../../../lib/launch-campaign';

export default function ProductPage() {
  const { id }=useParams<{id:string}>(); const [product,setProduct]=useState<ProductListing|null>(null); const [loading,setLoading]=useState(true); const [error,setError]=useState(''); const [notice,setNotice]=useState('');
  useEffect(()=>{let active=true;void api.products.get(id).then(({product:item})=>{if(active)setProduct(item)}).catch((cause)=>{if(active)setError(cause instanceof Error?cause.message:'تعذر تحميل المنتج.')}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[id]);
  if(loading)return <PageShell label="المنتج"><SkeletonGrid count={2}/></PageShell>;
  if(error||!product)return <PageShell label="المنتج"><EmptyState icon={<PlatformIcon name="close" size={32}/>} title="المنتج غير متاح" description={error||'هذا المنتج غير منشور.'} actions={<ActionLink href="/store">العودة إلى المتجر</ActionLink>}/></PageShell>;
  const share=()=>window.open(`https://wa.me/?text=${encodeURIComponent(buildKhedmaShareText(product.titleAr,window.location.href))}`,'_blank','noopener,noreferrer');
  const copy=async()=>{try{await navigator.clipboard.writeText(buildKhedmaShareText(product.titleAr,window.location.href));setNotice('تم نسخ رسالة المنتج والرابط')}catch{setNotice('تعذر نسخ الرابط')}setTimeout(()=>setNotice(''),2000)};
  const images=product.imageUrls?.length?product.imageUrls:product.imageUrl?[product.imageUrl]:[];
  const orderEnabled=['restaurant','cafe','bakery','sweets','catering','juice_icecream','butcher','grocery','fruits_vegetables','fish_poultry_shop','pharmacy'].includes(product.categoryCode)&&product.availability!=='out_of_stock';
  return <PageShell className={styles.page} label={product.titleAr}><PageHeader eyebrow="إعلان مبوب" title={product.titleAr} description={`معلن بواسطة ${product.businessName??'نشاط على خدمة'}`} backHref="/classifieds"/><div className={styles.detail}><Surface className={styles.gallery}>{images.length?images.map((url,index)=><div className={styles.image} key={url}><img src={url} alt={`${product.titleAr} — صورة ${index+1}`}/></div>):<div className={styles.image}><span>خ</span></div>}</Surface><Surface className={styles.detailBody}><span className={styles.status}>{product.availability==='in_stock'?'متوفر':product.availability==='made_to_order'?'حسب الطلب':'غير متوفر'}</span><strong className={styles.price}>{product.price.toLocaleString('ar-SY')} {product.currency}</strong>{product.descriptionAr&&<p>{product.descriptionAr}</p>}<div className={styles.actions}>{orderEnabled&&<ActionLink href={`/orders/checkout?productId=${encodeURIComponent(product.id)}`}>اطلب الآن — الدفع نقدي</ActionLink>}<ActionLink href={`/business-profiles/${product.businessProfileId}`} variant={orderEnabled?'secondary':'primary'}>فتح النشاط المعلن</ActionLink><ActionButton type="button" variant="secondary" onClick={share}>واتساب</ActionButton><ActionButton type="button" variant="secondary" onClick={()=>void copy()}>نسخ الرابط</ActionButton></div>{notice&&<p role="status">{notice}</p>}<p className={styles.notice}>{orderEnabled?'يؤكد النشاط الطلب ورسوم التوصيل قبل تعيين المندوب. الدفع نقدي عند التسليم.':'التواصل والاتفاق يتمان مباشرة مع النشاط المعلن.'}</p></Surface></div></PageShell>;
}
