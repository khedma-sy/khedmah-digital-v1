'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {driverDocumentsApi,type DriverReviewBusiness} from '../../../lib/driver-documents-client';
import {DriverDocumentsPanel} from '../../components/driver-documents-panel';
import {ActionButton,ActionLink,EmptyState,PageHeader,PageShell,SkeletonGrid,StatusMessage,Surface} from '../../components/ui-primitives';
import styles from '../../billing/billing.module.css';

export default function DriverDocumentsAdmin(){
  const router=useRouter(),alive=useRef(true);
  const [businesses,setBusinesses]=useState<DriverReviewBusiness[]>([]),[selected,setSelected]=useState<DriverReviewBusiness|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const load=useCallback(async()=>{setLoading(true);setError('');try{const result=await driverDocumentsApi.queue();if(alive.current)setBusinesses(result.businesses);}catch(cause){if(alive.current){const code=(cause as {statusCode?:number})?.statusCode;if(code===401)router.replace('/auth/login?next=%2Fadmin%2Fdriver-documents');else setError(code===403?'لا يملك هذا الحساب صلاحية مراجعة الوثائق.':'تعذر تحميل طابور الوثائق. أعد المحاولة.');}}finally{if(alive.current)setLoading(false);}},[router]);
  useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false;};},[load]);
  return <PageShell className={styles.page} label="مراجعة وثائق السائقين والمندوبين"><PageHeader title="وثائق السائقين ومندوبي التوصيل" description="راجع أحدث الوثائق الخاصة قبل اعتماد أهلية السائق أو المندوب." backHref="/admin"/>
    {error&&<StatusMessage tone="danger">{error}</StatusMessage>}<ActionButton variant="secondary" disabled={loading} onClick={()=>void load()}>تحديث طابور المراجعة</ActionButton>
    {loading?<SkeletonGrid count={2}/>:!error&&<Surface><h2>طلبات الوثائق المعلقة</h2><p>أقدم 200 نشاط لديه وثائق معلقة. حدّث الطابور بعد المراجعة لعرض الطلبات التالية.</p>{businesses.length?businesses.map(b=><article key={b.businessProfileId} className={styles.order}><h3>{b.name}</h3><p>{b.categoryCode==='taxi'?'تكسي':'مندوب توصيل'} · {b.cityCode} · {b.pendingDocuments} وثائق معلقة</p><ActionButton variant="secondary" onClick={()=>setSelected(b)}>فتح وثائق {b.name}</ActionButton></article>):<EmptyState title="لا توجد وثائق معلقة" description="تظهر الطلبات بعد أن يرفع أصحاب الأنشطة وثائقهم."/>}</Surface>}
    {selected&&<Surface><h2>{selected.name}</h2><DriverDocumentsPanel key={selected.businessProfileId} businessId={selected.businessProfileId} reviewer/><div className="ui-page-actions"><ActionLink href="/admin/verification" variant="secondary">مراجعة توثيق النشاط</ActionLink><ActionLink href="/admin/moderation" variant="secondary">مراجعة نشر النشاط</ActionLink>{selected.categoryCode==='taxi'&&<ActionLink href="/admin/taxi-drivers">اعتماد التكسي التشغيلي</ActionLink>}</div></Surface>}
  </PageShell>;
}
