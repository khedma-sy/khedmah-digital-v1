'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { driverDocumentsApi,driverDocumentLabels,type DriverDocument,type DriverDocumentType } from '../../lib/driver-documents-client';
import { ActionButton,StatusMessage,Surface } from './ui-primitives';
import styles from '../billing/billing.module.css';

export function DriverDocumentsPanel({businessId,reviewer=false,onReviewed}:{businessId:string;reviewer?:boolean;onReviewed?:()=>void}){
  const [documents,setDocuments]=useState<DriverDocument[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[retry,setRetry]=useState(0);
  const [decision,setDecision]=useState<{id:string;status:'approved'|'rejected'}|null>(null),[reason,setReason]=useState('');
  const inFlight=useRef(false),lifetime=useRef(0);
  useEffect(()=>{const version=++lifetime.current;setLoading(true);setDocuments([]);setDecision(null);setError('');setNotice('');
    void driverDocumentsApi.list(businessId).then(r=>{if(version===lifetime.current)setDocuments(r.documents);}).catch(()=>{if(version===lifetime.current)setError('تعذر تحميل الوثائق الخاصة. أعد المحاولة.');}).finally(()=>{if(version===lifetime.current)setLoading(false);});return()=>{lifetime.current++;};
  },[businessId,retry]);
  async function upload(event:FormEvent<HTMLFormElement>,kind:DriverDocumentType){
    event.preventDefault();if(inFlight.current||loading)return;
    const input=event.currentTarget.elements.namedItem('document') as HTMLInputElement,file=input.files?.[0];if(!file)return;
    inFlight.current=true;setBusy(true);setError('');setNotice('');const version=lifetime.current;
    try{await driverDocumentsApi.upload(businessId,kind,file);const result=await driverDocumentsApi.list(businessId);if(version===lifetime.current){setDocuments(result.documents);input.value='';setNotice('رُفعت الوثيقة بشكل خاص وأصبحت بانتظار المراجعة.');}}
    catch(cause){if(version===lifetime.current)setError(cause instanceof Error?cause.message:'تعذر رفع الوثيقة.');}finally{inFlight.current=false;if(version===lifetime.current)setBusy(false);}
  }
  async function review(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!decision||inFlight.current)return;
    inFlight.current=true;setBusy(true);setError('');const version=lifetime.current;
    try{await driverDocumentsApi.review(decision.id,decision.status,reason.trim());const result=await driverDocumentsApi.list(businessId);if(version===lifetime.current){setDocuments(result.documents);setDecision(null);setReason('');setNotice('حُفظ قرار الوثيقة في سجل المراجعة. اعتماد الوثائق لا يغني عن اعتماد النشاط والثقة.');onReviewed?.();}}
    catch{if(version===lifetime.current)setError('تعذر حفظ قرار المراجعة. أعد تحميل الوثائق قبل المحاولة مجددًا.');}finally{inFlight.current=false;if(version===lifetime.current)setBusy(false);}
  }
  const latest=new Map<DriverDocumentType,DriverDocument>();for(const doc of documents)if(!latest.has(doc.documentType))latest.set(doc.documentType,doc);
  return <section aria-label="وثائق السائق والمركبة"><h2>وثائق السائق والمركبة</h2><p>الوثائق خاصة. تُحسب أحدث نسخة لكل نوع، ويلزم اعتماد الأنواع الأربعة وحالة النشاط قبل إسناد طلب توصيل.</p>
    {error&&<StatusMessage tone="danger">{error}</StatusMessage>}{notice&&<StatusMessage tone="success">{notice}</StatusMessage>}
    <ActionButton variant="secondary" disabled={busy||loading} onClick={()=>setRetry(n=>n+1)}>تحديث الوثائق</ActionButton>
    {loading?<p role="status">جارٍ تحميل الوثائق…</p>:<><p>المعتمد: {[...latest.values()].filter(d=>d.reviewStatus==='approved').length} من 4</p><div className={styles.grid}>{(Object.entries(driverDocumentLabels) as Array<[DriverDocumentType,string]>).map(([kind,label])=>{const doc=latest.get(kind);return <Surface key={kind}><h3>{label}</h3><p>{doc?{pending:'بانتظار المراجعة',approved:'معتمد',rejected:'مرفوض — أعد الرفع بعد التصحيح'}[doc.reviewStatus]:'غير مرفوع'}</p>{doc?.reviewReason&&<p>{doc.reviewReason}</p>}
      {reviewer?doc&&<><a target="_blank" rel="noopener noreferrer" href={`/api/v1/driver-documents/${encodeURIComponent(doc.id)}/content`}>عرض الوثيقة الخاصة</a><div className="ui-page-actions"><ActionButton disabled={busy} onClick={()=>{setDecision({id:doc.id,status:'approved'});setReason('');}}>مراجعة الاعتماد</ActionButton><ActionButton variant="secondary" disabled={busy} onClick={()=>{setDecision({id:doc.id,status:'rejected'});setReason('');}}>مراجعة الرفض</ActionButton></div></>:<form className={styles.form} onSubmit={e=>void upload(e,kind)}><label>{doc?'رفع نسخة جديدة من':'رفع'} {label}<input name="document" type="file" required accept="image/jpeg,image/png,image/webp" disabled={busy}/></label><ActionButton type="submit" variant="secondary" disabled={busy}>رفع الوثيقة الخاصة</ActionButton></form>}
    </Surface>;})}</div></>}
    {decision&&<Surface as="form" className={styles.form} onSubmit={e=>void review(e)}><h3>{decision.status==='approved'?'اعتماد الوثيقة بعد فحصها':'رفض الوثيقة وإعادتها للتصحيح'}</h3><label>ملاحظة المراجعة<input value={reason} onChange={e=>setReason(e.target.value)} required={decision.status==='rejected'} minLength={decision.status==='rejected'?3:undefined} maxLength={500} disabled={busy}/></label><p>تأكد من مطابقة الوثيقة لصاحب الطلب وصلاحيتها قبل حفظ القرار.</p><div className="ui-page-actions"><ActionButton type="submit" disabled={busy||(decision.status==='rejected'&&reason.trim().length<3)}>حفظ قرار المراجعة</ActionButton><ActionButton type="button" variant="secondary" disabled={busy} onClick={()=>setDecision(null)}>إلغاء</ActionButton></div></Surface>}
  </section>;
}
