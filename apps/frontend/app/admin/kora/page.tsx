'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { koraAdminApi, type KoraExecutive, type KoraExpose, type KoraFinding, type KoraMetric, type KoraSeverity, type KoraTask } from '../../../lib/kora-admin-client';
import styles from './kora.module.css';

type KillResult={decision:string;questions:string[]};
type AutopsyResult={rootCause:{status:'undetermined';reason:string};nextEvidence:string[];preventionDecision:string};
type DraftTaskInput={kind:KoraFinding['kind'];resource:string;title:string;summary:string;severity:KoraSeverity;evidence:string};
const severityAr:Record<KoraSeverity,string>={low:'منخفض',medium:'متوسط',high:'مرتفع',critical:'حرج'};
const statusAr:Record<string,string>={available:'متاح',process_local:'محلي للعملية',not_instrumented:'غير مربوط',not_observed:'غير مرصود'};

export default function KoraAdminPage(){
  const router=useRouter();
  const [executive,setExecutive]=useState<KoraExecutive|null>(null);
  const [expose,setExpose]=useState<KoraExpose|null>(null);
  const [metrics,setMetrics]=useState<KoraMetric[]>([]);
  const [findings,setFindings]=useState<KoraFinding[]>([]);
  const [tasks,setTasks]=useState<KoraTask[]>([]);
  const [killResult,setKillResult]=useState<KillResult|null>(null);
  const [autopsyResult,setAutopsyResult]=useState<AutopsyResult|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [hasEvidence,setHasEvidence]=useState(false);
  const [drafting,setDrafting]=useState(false);
  const [killLoading,setKillLoading]=useState(false);
  const [autopsyLoading,setAutopsyLoading]=useState(false);
  const generation=useRef(0),active=useRef(false);
  const operationEpoch=useRef(0),actionSequence=useRef(0);
  const draftRequest=useRef<number|null>(null),killRequest=useRef<number|null>(null),autopsyRequest=useRef<number|null>(null);

  async function refresh(){
    if(!active.current)return;
    const version=++generation.current;
    setLoading(true);setError('');setHasEvidence(false);
    setExecutive(null);setExpose(null);setMetrics([]);setFindings([]);
    try{
      const [e,x,m,a]=await Promise.all([koraAdminApi.executive(),koraAdminApi.expose(),koraAdminApi.metrics(),koraAdminApi.anomalies()]);
      if(!active.current||version!==generation.current)return;
      setExecutive(e);setExpose(x);setMetrics(m.metrics);setFindings(a.findings);setHasEvidence(true);
    }catch(c){
      if(!active.current||version!==generation.current)return;
      const status=c instanceof Error?(c as Error&{statusCode?:number}).statusCode:undefined;
      if(status===401){router.replace('/auth/login?next=%2Fadmin%2Fkora');return;}
      setError(status===403?'هذا الحساب لا يملك صلاحية KORA التشغيلية.':c instanceof Error?c.message:'تعذر تحميل KORA.');
    }finally{if(active.current&&version===generation.current)setLoading(false);}
  }
  useEffect(()=>{active.current=true;void refresh();return()=>{
    active.current=false;generation.current++;operationEpoch.current++;
    draftRequest.current=null;killRequest.current=null;autopsyRequest.current=null;
  };},[]);

  const available=useMemo(()=>metrics.filter(m=>m.status!=='not_instrumented'),[metrics]);
  const gaps=useMemo(()=>metrics.filter(m=>m.status==='not_instrumented'),[metrics]);

  async function runDraft(data:DraftTaskInput,afterSuccess?:()=>void){
    if(!active.current||draftRequest.current!==null)return;
    const request=++actionSequence.current,epoch=operationEpoch.current;
    draftRequest.current=request;setDrafting(true);setError('');
    try{
      const r=await koraAdminApi.draftTask(data);
      if(!active.current||epoch!==operationEpoch.current||draftRequest.current!==request)return;
      setTasks(t=>[r.task,...t]);afterSuccess?.();
    }catch(c){
      if(active.current&&epoch===operationEpoch.current&&draftRequest.current===request)setError(c instanceof Error?c.message:'تعذر إنشاء مسودة المهمة.');
    }finally{
      if(draftRequest.current===request){draftRequest.current=null;if(active.current&&epoch===operationEpoch.current)setDrafting(false);}
    }
  }
  async function draftFromFinding(f:KoraFinding){
    await runDraft({kind:f.kind,resource:f.resource,title:f.title,summary:f.summary,severity:f.severity,evidence:f.evidence});
  }
  async function submitTask(e:FormEvent<HTMLFormElement>){
    e.preventDefault();const f=e.currentTarget;
    await runDraft({kind:(f.elements.namedItem('kind') as HTMLSelectElement).value as KoraFinding['kind'],resource:(f.elements.namedItem('resource') as HTMLInputElement).value,title:(f.elements.namedItem('title') as HTMLInputElement).value,summary:(f.elements.namedItem('summary') as HTMLTextAreaElement).value,severity:(f.elements.namedItem('severity') as HTMLSelectElement).value as KoraSeverity,evidence:(f.elements.namedItem('evidence') as HTMLTextAreaElement).value},()=>f.reset());
  }
  async function submitKill(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    if(!active.current||killRequest.current!==null)return;
    const f=e.currentTarget,request=++actionSequence.current,epoch=operationEpoch.current;
    killRequest.current=request;setKillLoading(true);setKillResult(null);setError('');
    try{
      const r=await koraAdminApi.killCritic({action:(f.elements.namedItem('action') as HTMLInputElement).value,targetEnvironment:(f.elements.namedItem('environment') as HTMLSelectElement).value as 'preview'|'staging'|'production'|'platform',impact:(f.elements.namedItem('impact') as HTMLSelectElement).value as KoraSeverity});
      if(active.current&&epoch===operationEpoch.current&&killRequest.current===request)setKillResult(r);
    }catch(c){
      if(active.current&&epoch===operationEpoch.current&&killRequest.current===request)setError(c instanceof Error?c.message:'تعذر تشغيل KillCritic.');
    }finally{
      if(killRequest.current===request){killRequest.current=null;if(active.current&&epoch===operationEpoch.current)setKillLoading(false);}
    }
  }
  async function submitAutopsy(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    if(!active.current||autopsyRequest.current!==null)return;
    const f=e.currentTarget,request=++actionSequence.current,epoch=operationEpoch.current;
    autopsyRequest.current=request;setAutopsyLoading(true);setAutopsyResult(null);setError('');
    try{
      const r=await koraAdminApi.autopsy({title:(f.elements.namedItem('title') as HTMLInputElement).value,observedAt:new Date((f.elements.namedItem('observedAt') as HTMLInputElement).value).toISOString(),summary:(f.elements.namedItem('summary') as HTMLTextAreaElement).value,evidence:(f.elements.namedItem('evidence') as HTMLTextAreaElement).value});
      if(active.current&&epoch===operationEpoch.current&&autopsyRequest.current===request)setAutopsyResult(r);
    }catch(c){
      if(active.current&&epoch===operationEpoch.current&&autopsyRequest.current===request)setError(c instanceof Error?c.message:'تعذر تشغيل Autopsy.');
    }finally{
      if(autopsyRequest.current===request){autopsyRequest.current=null;if(active.current&&epoch===operationEpoch.current)setAutopsyLoading(false);}
    }
  }

  return <main id="foundation-content" className={styles.shell} dir="rtl">
    <header className={styles.hero}><div><p>خدمة · KORA Executive Admin OS</p><h1>مركز القيادة والإدارة الشامل</h1><span>KORA طبقة إشراف وتحليل وصياغة مهام. لا تنفذ تغييرات تلقائياً ولا تعتبر نقص القياس صفراً.</span></div><div className={styles.heroActions}><button onClick={()=>void refresh()} disabled={loading}>{loading?'جاري التحديث…':'تحديث الأدلة'}</button><Link href="/admin">لوحة الإدارة</Link></div></header>
    {error?<div className={styles.error} role="alert">{error}</div>:null}

    <section className={styles.summary} aria-label="ملخص KORA التنفيذي">
      <article><span>مستوى المخاطر</span><strong>{executive?severityAr[executive.riskLevel]:'—'}</strong></article>
      <article><span>مشكلات مؤكدة</span><strong>{executive?.problemCount??'—'}</strong></article>
      <article><span>مقاييس موصولة</span><strong>{hasEvidence?available.length:'—'}</strong></article>
      <article><span>فجوات القياس</span><strong>{hasEvidence?gaps.length:'—'}</strong></article>
      <article><span>قرار مالك مطلوب</span><strong>{executive?(executive.needsOwnerDecision?'نعم':'لا'):'غير محدد'}</strong></article>
    </section>

    <section className={styles.gridTwo}>
      <article className={styles.panel}><div className={styles.panelHead}><div><span>Executive</span><h2>ماذا يحدث الآن؟</h2></div><b>Supervised</b></div><div className={styles.metricGrid}>{available.map(m=><div key={m.key} className={styles.metric}><span>{m.label}</span><strong>{m.value??'—'}</strong><small>{statusAr[m.status]??m.status} · {m.window}</small></div>)}</div>{executive?.recommendations.map((r,i)=><p key={i} className={styles.note}>{r}</p>)}<p className={styles.boundary}>الحوادث والتغييرات القادمة من Operations مؤقتة في ذاكرة عملية الخادم وليست سجلاً دائماً عبر كل النسخ.</p></article>
      <article className={styles.panel}><div className={styles.panelHead}><div><span>Expose</span><h2>الفجوات التي لا يجوز إخفاؤها</h2></div><b>{hasEvidence?gaps.length:"—"}</b></div>{gaps.map(g=><div key={g.key} className={styles.gap}><strong>{g.label}</strong><span>{g.note??'غير مربوط بمصدر موثوق حتى الآن.'}</span></div>)}{expose?.note?<p className={styles.boundary}>{expose.note}</p>:null}</article>
    </section>

    <section className={styles.panel}><div className={styles.panelHead}><div><span>Operations map</span><h2>الوحدات والمهام الجديدة</h2></div><b>مربوطة حسب العقد الفعلي</b></div><div className={styles.moduleGrid}>
      <Link href="/orders/merchant"><strong>إدارة المطاعم</strong><span>Restaurant Command Center · الطلبات والقائمة والساعات وKPIs</span></Link>
      <Link href="/admin/categories"><strong>إدارة التصنيفات</strong><span>الشجرة، الترتيب، Featured، التفعيل والتعطيل الآمن</span></Link>
      <Link href="/admin/moderation"><strong>المراجعة والبلاغات</strong><span>قرارات بشرية للمحتوى والبلاغات</span></Link>
      <Link href="/admin/verification"><strong>التحقق</strong><span>طلبات التحقق والمستندات</span></Link>
      <Link href="/admin/operations-product"><strong>Operations Product</strong><span>الحوادث والتغييرات والبنية التشغيلية</span></Link>
      <Link href="/admin/taxi-drivers"><strong>اعتماد سائقي التكسي</strong><span>مراجعة السائق والسيارة ومنطقة التشغيل ومتابعة الاعتماد.</span></Link>
      <Link href="/admin/taxi-pricing"><strong>تسعيرة التكسي</strong><span>السجل ومحاكاة الأجرة واعتماد إصدار جديد. حفظ التسعيرة لا يفعّل الرحلات.</span></Link>
      <Link href="/admin/billing"><strong>الفوترة والسداد</strong><span>مراجعة السداد اليدوي ومطابقة المبلغ والمرجع. الدفع الإلكتروني غير موصول.</span></Link>
      <Link href="/billing"><strong>الباقات وكود الخصم</strong><span>مراجعة الباقة والخصم وسجل الاشتراكات والنقاط.</span></Link>
      <Link href="/admin/driver-documents"><strong>وثائق السائق والمندوب</strong><span>مراجعة أحدث الوثائق؛ اعتمادها لا يعيّن المندوب تلقائيًا.</span></Link>
      <Link href="/orders/courier"><strong>مهام مندوب التوصيل</strong><span>القبول والاعتذار والاستلام والتسليم ضمن الطلب المسند.</span></Link>
    </div></section>

    <section className={styles.gridTwo}>
      <article className={styles.panel}><div className={styles.panelHead}><div><span>Findings</span><h2>الحوادث والشذوذ المؤكد</h2></div><b>{hasEvidence?findings.length:"—"}</b></div>{!hasEvidence?<p className={styles.empty}>{loading?'جارٍ قراءة الأدلة التشغيلية…':'لم تكتمل قراءة الأدلة. أعد المحاولة لتحديد حالة الحوادث.'}</p>:findings.length?findings.map(f=><div className={styles.finding} key={f.id}><div><strong>{f.title}</strong><span>{severityAr[f.severity]} · {f.resource}</span><p>{f.summary}</p></div><button disabled={drafting} onClick={()=>void draftFromFinding(f)}>{drafting?'جارٍ إنشاء المسودة…':'حوّل إلى مهمة'}</button></div>):<p className={styles.empty}>لا توجد finding عالية/حرجة مؤكدة من المصادر الموصولة حالياً.</p>}</article>
      <article className={styles.panel}><div className={styles.panelHead}><div><span>UI evidence</span><h2>فحوص الواجهة</h2></div><b>{expose?.uiChecks.length??'—'}</b></div>{expose?.uiChecks.map(c=><div className={styles.check} key={c.id}><div><strong>{c.label}</strong><span>{severityAr[c.severity]}</span></div><em>{statusAr[c.status]??c.status}</em></div>)}</article>
    </section>

    <section className={styles.gridTwo}>
      <article className={styles.panel}><div className={styles.panelHead}><div><span>Admin Tasks</span><h2>صياغة مهمة KORA</h2></div><b>Draft only</b></div><form className={styles.form} aria-busy={drafting} onSubmit={submitTask}><div className={styles.row}><select name="kind" defaultValue="operational_anomaly"><option value="operational_anomaly">شذوذ تشغيلي</option><option value="ui_failure">فشل واجهة</option><option value="telemetry_gap">فجوة قياس</option><option value="incident">حادثة</option></select><select name="severity" defaultValue="medium"><option value="low">منخفض</option><option value="medium">متوسط</option><option value="high">مرتفع</option><option value="critical">حرج</option></select></div><input name="resource" placeholder="المورد / الوحدة" required minLength={2}/><input name="title" placeholder="عنوان المهمة" required minLength={3}/><textarea name="summary" placeholder="الملخص" required minLength={10}/><textarea name="evidence" placeholder="الدليل" required minLength={3}/><button type="submit" disabled={drafting}>{drafting?'جارٍ إنشاء المسودة…':'إنشاء مسودة مهمة'}</button></form>{tasks.map(t=><div className={styles.task} key={t.id}><b>{t.priority}</b><div><strong>{t.title}</strong><span>{t.summary}</span><small>{t.approvalRequired?'تحتاج موافقة بشرية':'تحتاج مراجعة'} · غير قابلة للتنفيذ التلقائي</small></div></div>)}</article>

      <article className={styles.panel}><div className={styles.panelHead}><div><span>KillCritic</span><h2>اختبر القرار قبل التنفيذ</h2></div><b>لا تنفيذ</b></div><form className={styles.form} aria-busy={killLoading} onSubmit={submitKill}><input name="action" placeholder="التغيير المقترح" required minLength={3}/><div className={styles.row}><select name="environment" defaultValue="preview"><option value="preview">Preview</option><option value="staging">Staging</option><option value="production">Production</option><option value="platform">Platform</option></select><select name="impact" defaultValue="medium"><option value="low">منخفض</option><option value="medium">متوسط</option><option value="high">مرتفع</option><option value="critical">حرج</option></select></div><button type="submit" disabled={killLoading}>{killLoading?'جارٍ تشغيل KillCritic…':'تشغيل KillCritic'}</button></form>{killResult?<div className={styles.result}><strong>القرار: {killResult.decision}</strong>{killResult.questions.map((q,i)=><p key={i}>{q}</p>)}</div>:null}</article>
    </section>

    <section className={styles.panel}><div className={styles.panelHead}><div><span>Autopsy</span><h2>تحليل حادثة بالدليل</h2></div><b>Root cause يبقى غير محدد حتى يثبت</b></div><form className={styles.autopsyForm} aria-busy={autopsyLoading} onSubmit={submitAutopsy}><input name="title" placeholder="عنوان الحادثة" required minLength={3}/><input name="observedAt" type="datetime-local" required/><textarea name="summary" placeholder="ما الذي حدث؟" required minLength={10}/><textarea name="evidence" placeholder="السجلات، SHA، request IDs، الأدلة" required minLength={3}/><button type="submit" disabled={autopsyLoading}>{autopsyLoading?'جارٍ تشغيل Autopsy…':'تشغيل Autopsy'}</button></form>{autopsyResult?<div className={styles.result}><strong>{autopsyResult.rootCause.status}: {autopsyResult.rootCause.reason}</strong>{autopsyResult.nextEvidence.map((x,i)=><p key={i}>{x}</p>)}<p>{autopsyResult.preventionDecision}</p></div>:null}</section>
  </main>;
}
