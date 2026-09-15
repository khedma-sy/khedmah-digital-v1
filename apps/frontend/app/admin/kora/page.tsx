'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { koraAdminApi, type KoraExecutive, type KoraExpose, type KoraFinding, type KoraMetric, type KoraSeverity, type KoraTask } from '../../../lib/kora-admin-client';
import styles from './kora.module.css';

type KillResult={decision:string;questions:string[]};
type AutopsyResult={rootCause:{status:'undetermined';reason:string};nextEvidence:string[];preventionDecision:string};
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

  async function refresh(){
    setLoading(true);setError('');
    try{
      const [e,x,m,a]=await Promise.all([koraAdminApi.executive(),koraAdminApi.expose(),koraAdminApi.metrics(),koraAdminApi.anomalies()]);
      setExecutive(e);setExpose(x);setMetrics(m.metrics);setFindings(a.findings);
    }catch(c){
      const status=c instanceof Error?(c as Error&{statusCode?:number}).statusCode:undefined;
      if(status===401){router.replace('/auth/login?next=%2Fadmin%2Fkora');return;}
      setError(status===403?'هذا الحساب لا يملك صلاحية KORA التشغيلية.':c instanceof Error?c.message:'تعذر تحميل KORA.');
    }finally{setLoading(false);}
  }
  useEffect(()=>{void refresh();},[]);

  const available=useMemo(()=>metrics.filter(m=>m.status!=='not_instrumented'),[metrics]);
  const gaps=useMemo(()=>metrics.filter(m=>m.status==='not_instrumented'),[metrics]);

  async function draftFromFinding(f:KoraFinding){
    try{const r=await koraAdminApi.draftTask({kind:f.kind,resource:f.resource,title:f.title,summary:f.summary,severity:f.severity,evidence:f.evidence});setTasks(t=>[r.task,...t]);}
    catch(c){setError(c instanceof Error?c.message:'تعذر إنشاء مسودة المهمة.');}
  }
  async function submitTask(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=e.currentTarget;try{const r=await koraAdminApi.draftTask({kind:(f.elements.namedItem('kind') as HTMLSelectElement).value as KoraFinding['kind'],resource:(f.elements.namedItem('resource') as HTMLInputElement).value,title:(f.elements.namedItem('title') as HTMLInputElement).value,summary:(f.elements.namedItem('summary') as HTMLTextAreaElement).value,severity:(f.elements.namedItem('severity') as HTMLSelectElement).value as KoraSeverity,evidence:(f.elements.namedItem('evidence') as HTMLTextAreaElement).value});setTasks(t=>[r.task,...t]);f.reset();}catch(c){setError(c instanceof Error?c.message:'تعذر إنشاء المهمة.');}}
  async function submitKill(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=e.currentTarget;try{const r=await koraAdminApi.killCritic({action:(f.elements.namedItem('action') as HTMLInputElement).value,targetEnvironment:(f.elements.namedItem('environment') as HTMLSelectElement).value as 'preview'|'staging'|'production'|'platform',impact:(f.elements.namedItem('impact') as HTMLSelectElement).value as KoraSeverity});setKillResult(r);}catch(c){setError(c instanceof Error?c.message:'تعذر تشغيل KillCritic.');}}
  async function submitAutopsy(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=e.currentTarget;try{const r=await koraAdminApi.autopsy({title:(f.elements.namedItem('title') as HTMLInputElement).value,observedAt:new Date((f.elements.namedItem('observedAt') as HTMLInputElement).value).toISOString(),summary:(f.elements.namedItem('summary') as HTMLTextAreaElement).value,evidence:(f.elements.namedItem('evidence') as HTMLTextAreaElement).value});setAutopsyResult(r);}catch(c){setError(c instanceof Error?c.message:'تعذر تشغيل Autopsy.');}}

  return <main id="foundation-content" className={styles.shell} dir="rtl">
    <header className={styles.hero}><div><p>خدمة · KORA Executive Admin OS</p><h1>مركز القيادة والإدارة الشامل</h1><span>KORA طبقة إشراف وتحليل وصياغة مهام. لا تنفذ تغييرات تلقائياً ولا تعتبر نقص القياس صفراً.</span></div><div className={styles.heroActions}><button onClick={()=>void refresh()} disabled={loading}>{loading?'جاري التحديث…':'تحديث الأدلة'}</button><Link href="/admin">لوحة الإدارة</Link></div></header>
    {error?<div className={styles.error} role="alert">{error}</div>:null}

    <section className={styles.summary} aria-label="ملخص KORA التنفيذي">
      <article><span>مستوى المخاطر</span><strong>{executive?severityAr[executive.riskLevel]:'—'}</strong></article>
      <article><span>مشكلات مؤكدة</span><strong>{executive?.problemCount??'—'}</strong></article>
      <article><span>مقاييس موصولة</span><strong>{available.length}</strong></article>
      <article><span>فجوات القياس</span><strong>{gaps.length}</strong></article>
      <article><span>قرار مالك مطلوب</span><strong>{executive?.needsOwnerDecision?'نعم':'لا'}</strong></article>
    </section>

    <section className={styles.gridTwo}>
      <article className={styles.panel}><div className={styles.panelHead}><div><span>Executive</span><h2>ماذا يحدث الآن؟</h2></div><b>Supervised</b></div><div className={styles.metricGrid}>{available.map(m=><div key={m.key} className={styles.metric}><span>{m.label}</span><strong>{m.value??'—'}</strong><small>{statusAr[m.status]??m.status} · {m.window}</small></div>)}</div>{executive?.recommendations.map((r,i)=><p key={i} className={styles.note}>{r}</p>)}<p className={styles.boundary}>الحوادث والتغييرات القادمة من Operations مؤقتة في ذاكرة عملية الخادم وليست سجلاً دائماً عبر كل النسخ.</p></article>
      <article className={styles.panel}><div className={styles.panelHead}><div><span>Expose</span><h2>الفجوات التي لا يجوز إخفاؤها</h2></div><b>{gaps.length}</b></div>{gaps.map(g=><div key={g.key} className={styles.gap}><strong>{g.label}</strong><span>{g.note??'غير مربوط بمصدر موثوق حتى الآن.'}</span></div>)}{expose?.note?<p className={styles.boundary}>{expose.note}</p>:null}</article>
    </section>

    <section className={styles.panel}><div className={styles.panelHead}><div><span>Operations map</span><h2>الوحدات والمهام الجديدة</h2></div><b>مربوطة حسب العقد الفعلي</b></div><div className={styles.moduleGrid}>
      <Link href="/orders/merchant"><strong>إدارة المطاعم</strong><span>Restaurant Command Center · الطلبات والقائمة والساعات وKPIs</span></Link>
      <Link href="/admin/categories"><strong>إدارة التصنيفات</strong><span>الشجرة، الترتيب، Featured، التفعيل والتعطيل الآمن</span></Link>
      <Link href="/admin/moderation"><strong>المراجعة والبلاغات</strong><span>قرارات بشرية للمحتوى والبلاغات</span></Link>
      <Link href="/admin/verification"><strong>التحقق</strong><span>طلبات التحقق والمستندات</span></Link>
      <Link href="/admin/operations-product"><strong>Operations Product</strong><span>الحوادث والتغييرات والبنية التشغيلية</span></Link>
      <div className={styles.pendingModule}><strong>Taxi Pricing</strong><span>Backend + Migration 029 جاهزان؛ واجهة التسعير الإدارية مستقلة وقيد الربط.</span></div>
      <div className={styles.pendingModule}><strong>Billing & Points</strong><span>Backend + Migration 030 جاهزان؛ واجهة Billing لم تُثبت بعد.</span></div>
    </div></section>

    <section className={styles.gridTwo}>
      <article className={styles.panel}><div className={styles.panelHead}><div><span>Findings</span><h2>الحوادث والشذوذ المؤكد</h2></div><b>{findings.length}</b></div>{findings.length?findings.map(f=><div className={styles.finding} key={f.id}><div><strong>{f.title}</strong><span>{severityAr[f.severity]} · {f.resource}</span><p>{f.summary}</p></div><button onClick={()=>void draftFromFinding(f)}>حوّل إلى مهمة</button></div>):<p className={styles.empty}>لا توجد finding عالية/حرجة مؤكدة من المصادر الموصولة حالياً.</p>}</article>
      <article className={styles.panel}><div className={styles.panelHead}><div><span>UI evidence</span><h2>فحوص الواجهة</h2></div><b>{expose?.uiChecks.length??0}</b></div>{expose?.uiChecks.map(c=><div className={styles.check} key={c.id}><div><strong>{c.label}</strong><span>{severityAr[c.severity]}</span></div><em>{statusAr[c.status]??c.status}</em></div>)}</article>
    </section>

    <section className={styles.gridTwo}>
      <article className={styles.panel}><div className={styles.panelHead}><div><span>Admin Tasks</span><h2>صياغة مهمة KORA</h2></div><b>Draft only</b></div><form className={styles.form} onSubmit={submitTask}><div className={styles.row}><select name="kind" defaultValue="operational_anomaly"><option value="operational_anomaly">شذوذ تشغيلي</option><option value="ui_failure">فشل واجهة</option><option value="telemetry_gap">فجوة قياس</option><option value="incident">حادثة</option></select><select name="severity" defaultValue="medium"><option value="low">منخفض</option><option value="medium">متوسط</option><option value="high">مرتفع</option><option value="critical">حرج</option></select></div><input name="resource" placeholder="المورد / الوحدة" required minLength={2}/><input name="title" placeholder="عنوان المهمة" required minLength={3}/><textarea name="summary" placeholder="الملخص" required minLength={10}/><textarea name="evidence" placeholder="الدليل" required minLength={3}/><button type="submit">إنشاء مسودة مهمة</button></form>{tasks.map(t=><div className={styles.task} key={t.id}><b>{t.priority}</b><div><strong>{t.title}</strong><span>{t.summary}</span><small>{t.approvalRequired?'تحتاج موافقة بشرية':'تحتاج مراجعة'} · غير قابلة للتنفيذ التلقائي</small></div></div>)}</article>

      <article className={styles.panel}><div className={styles.panelHead}><div><span>KillCritic</span><h2>اختبر القرار قبل التنفيذ</h2></div><b>لا تنفيذ</b></div><form className={styles.form} onSubmit={submitKill}><input name="action" placeholder="التغيير المقترح" required minLength={3}/><div className={styles.row}><select name="environment" defaultValue="preview"><option value="preview">Preview</option><option value="staging">Staging</option><option value="production">Production</option><option value="platform">Platform</option></select><select name="impact" defaultValue="medium"><option value="low">منخفض</option><option value="medium">متوسط</option><option value="high">مرتفع</option><option value="critical">حرج</option></select></div><button type="submit">تشغيل KillCritic</button></form>{killResult?<div className={styles.result}><strong>القرار: {killResult.decision}</strong>{killResult.questions.map((q,i)=><p key={i}>{q}</p>)}</div>:null}</article>
    </section>

    <section className={styles.panel}><div className={styles.panelHead}><div><span>Autopsy</span><h2>تحليل حادثة بالدليل</h2></div><b>Root cause يبقى غير محدد حتى يثبت</b></div><form className={styles.autopsyForm} onSubmit={submitAutopsy}><input name="title" placeholder="عنوان الحادثة" required minLength={3}/><input name="observedAt" type="datetime-local" required/><textarea name="summary" placeholder="ما الذي حدث؟" required minLength={10}/><textarea name="evidence" placeholder="السجلات، SHA، request IDs، الأدلة" required minLength={3}/><button type="submit">تشغيل Autopsy</button></form>{autopsyResult?<div className={styles.result}><strong>{autopsyResult.rootCause.status}: {autopsyResult.rootCause.reason}</strong>{autopsyResult.nextEvidence.map((x,i)=><p key={i}>{x}</p>)}<p>{autopsyResult.preventionDecision}</p></div>:null}</section>
  </main>;
}
