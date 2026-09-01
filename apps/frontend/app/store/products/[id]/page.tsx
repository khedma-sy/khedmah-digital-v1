'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, type ProductListing } from '../../../../lib/api-client';
import { ActionButton, ActionLink, EmptyState, PageHeader, PageShell, SkeletonGrid, Surface } from '../../../components/ui-primitives';
import { PlatformIcon } from '../../../components/platform-icon';
import styles from '../../store.module.css';

export default function ProductPage() {
  const { id }=useParams<{id:string}>(); const [product,setProduct]=useState<ProductListing|null>(null); const [loading,setLoading]=useState(true); const [error,setError]=useState(''); const [notice,setNotice]=useState('');
  useEffect(()=>{let active=true;void api.products.get(id).then(({product:item})=>{if(active)setProduct(item)}).catch((cause)=>{if(active)setError(cause instanceof Error?cause.message:'تعذر تحميل المنتج.')}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[id]);
  if(loading)return <PageShell label="المنتج"><SkeletonGrid count={2}/></PageShell>;
  if(error||!product)return <PageShell label="المنتج"><EmptyState icon={<PlatformIcon name="close" size={32}/>} title="المنتج غير متاح" description={error||'هذا المنتج غير منشور.'} actions={<ActionLink href="/store">العودة إلى المتجر</ActionLink>}/></PageShell>;
  const share=()=>window.open(`https://wa.me/?text=${encodeURIComponent(`${product.titleAr}\n${window.location.href}`)}`,'_blank','noopener,noreferrer');
  const copy=async()=>{try{await navigator.clipboard.writeText(window.location.href);setNotice('تم نسخ رابط المنتج')}catch{setNotice('تعذر نسخ الرابط')}setTimeout(()=>setNotice(''),2000)};
  const images=product.imageUrls?.length?product.imageUrls:product.imageUrl?[product.imageUrl]:[];
  return <PageShell className={styles.page} label={product.titleAr}><PageHeader eyebrow="إعلان مبوب" title={product.titleAr} description={`معلن بواسطة ${product.businessName??'نشاط على خدمة'}`} backHref="/classifieds"/><div className={styles.detail}><Surface className={styles.gallery}>{images.length?images.map((url,index)=><div className={styles.image} key={url}><img src={url} alt={`${product.titleAr} — صورة ${index+1}`}/></div>):<div className={styles.image}><span>خ</span></div>}</Surface><Surface className={styles.detailBody}><span className={styles.status}>{product.availability==='in_stock'?'متوفر':product.availability==='made_to_order'?'حسب الطلب':'غير متوفر'}</span><strong className={styles.price}>{product.price.toLocaleString('ar-SY')} {product.currency}</strong>{product.descriptionAr&&<p>{product.descriptionAr}</p>}<div className={styles.actions}><ActionLink href={`/business-profiles/${product.businessProfileId}`}>فتح النشاط المعلن</ActionLink><ActionButton type="button" variant="secondary" onClick={share}>واتساب</ActionButton><ActionButton type="button" variant="secondary" onClick={()=>void copy()}>نسخ الرابط</ActionButton></div>{notice&&<p role="status">{notice}</p>}<p className={styles.notice}>التواصل والاتفاق يتمان مباشرة مع النشاط المعلن. لا تعالج خدمة المدفوعات أو الطلبات.</p></Surface></div></PageShell>;
}
