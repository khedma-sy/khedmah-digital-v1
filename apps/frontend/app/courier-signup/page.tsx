'use client';
import {useEffect,useState} from 'react';
import {api,type PublicBusinessProfile} from '../../lib/api-client';
import {ActionButton,ActionLink,PageHeader,PageShell,SkeletonGrid,StatusMessage,Surface} from '../components/ui-primitives';
import {DriverDocumentsPanel} from '../components/driver-documents-panel';
import styles from '../billing/billing.module.css';

export default function CourierSignupPage(){
  const [businesses,setBusinesses]=useState<PublicBusinessProfile[]>([]),[selected,setSelected]=useState(''),[loading,setLoading]=useState(true),[guest,setGuest]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{let active=true;setLoading(true);setError('');void api.businesses.listMine().then(r=>{if(active){const owned=r.businesses.filter(b=>b.categoryCode==='delivery_courier');setBusinesses(owned);setSelected(owned[0]?.id??'');}}).catch(cause=>{if(active){if((cause as {statusCode?:number})?.statusCode===401)setGuest(true);else setError('تعذر تحميل نشاط التوصيل. أعد المحاولة.');}}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[retry]);
  const business=businesses.find(b=>b.id===selected);
  const profileReady=business?.visibility==='public'&&business.moderationStatus==='approved'&&business.trustStatus==='approved'&&business.status==='active';
  return <div className="khedmah-section-identity" data-khedmah-section="mobility"><PageShell className={styles.page} label="الانضمام كمندوب توصيل"><PageHeader title="انضم إلى خدمة كمندوب توصيل" description="سجّل نشاط التوصيل، ارفع وثائق السائق والمركبة، ثم تابع المراجعة قبل استقبال المهام." backHref="/mobility?type=delivery"/>
    {loading?<SkeletonGrid count={2}/>:guest?<Surface><p>سجّل الدخول لبدء طلب الانضمام ومتابعة الوثائق.</p><ActionLink href="/auth/login?next=%2Fcourier-signup">تسجيل الدخول</ActionLink></Surface>:error?<StatusMessage tone="danger">{error}<ActionButton onClick={()=>setRetry(n=>n+1)}>إعادة المحاولة</ActionButton></StatusMessage>:<>
      <Surface className={styles.form}><h2>١. نشاط التوصيل</h2>{businesses.length>0&&<label>اختر نشاطك<select value={selected} onChange={e=>setSelected(e.target.value)}>{businesses.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>}<ActionLink href="/business-profiles/new?categoryCode=delivery_courier" variant="secondary">إنشاء نشاط مندوب توصيل</ActionLink></Surface>
      {business&&<><DriverDocumentsPanel key={business.id} businessId={business.id}/><Surface><h2>٣. اعتماد النشاط واستقبال المهام</h2><p>{profileReady?'النشاط منشور ومعتمد وموثوق ونشط. لا يزال إسناد المهام يتطلب اعتماد أحدث الوثائق الأربع.':'أكمل بيانات النشاط وأرسله للمراجعة واطلب التوثيق. لا يمكن إسناد مهمة قبل اعتماد النشاط والثقة والوثائق الأربع.'}</p><div className="ui-page-actions"><ActionLink href={`/business-profiles/${business.id}/manage`}>بيانات النشاط وطلب المراجعة</ActionLink><ActionLink href="/orders/courier" variant="secondary">متابعة مهام التوصيل</ActionLink></div></Surface></>}
    </>}
  </PageShell></div>;
}
