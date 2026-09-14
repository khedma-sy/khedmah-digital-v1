'use client';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { categoryAdminApi, type AdminCategory } from '../../../lib/category-admin-client';
import styles from './categories-admin.module.css';

type Draft={code:string;nameAr:string;nameEn:string;parentCode:string;visualKey:string;isFeatured:boolean;status:'active'|'inactive';sortOrder:number};
const empty:Draft={code:'',nameAr:'',nameEn:'',parentCode:'',visualKey:'briefcase',isFeatured:false,status:'active',sortOrder:100};

export default function CategoryAdminPage(){
  const router=useRouter();
  const [categories,setCategories]=useState<AdminCategory[]>([]);
  const [draft,setDraft]=useState<Draft>(empty);
  const [editing,setEditing]=useState<string>();
  const [search,setSearch]=useState('');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const load=()=>categoryAdminApi.list().then(r=>setCategories(r.categories)).catch(c=>{const status=(c as Error&{statusCode?:number}).statusCode;if(status===401)router.replace('/auth/login?next=%2Fadmin%2Fcategories');else setError(status===403?'لا تملك صلاحية إدارة التصنيفات.':c instanceof Error?c.message:'تعذر تحميل التصنيفات.');}).finally(()=>setLoading(false));
  useEffect(()=>{void load();},[]);
  const roots=useMemo(()=>categories.filter(c=>!c.parentCode),[categories]);
  const filtered=useMemo(()=>{const q=search.trim().toLowerCase();return q?categories.filter(c=>`${c.code} ${c.nameAr} ${c.nameEn??''}`.toLowerCase().includes(q)):categories;},[categories,search]);
  const stats=useMemo(()=>({total:categories.length,active:categories.filter(c=>c.status==='active').length,featured:categories.filter(c=>c.isFeatured).length,roots:roots.length}),[categories,roots]);
  function edit(category:AdminCategory){setEditing(category.code);setDraft({code:category.code,nameAr:category.nameAr,nameEn:category.nameEn??'',parentCode:category.parentCode??'',visualKey:category.visualKey,isFeatured:category.isFeatured,status:category.status,sortOrder:category.sortOrder});setNotice('');setError('');}
  function reset(){setEditing(undefined);setDraft(empty);setNotice('');setError('');}
  async function submit(event:FormEvent){event.preventDefault();if(saving)return;setSaving(true);setError('');try{const payload={nameAr:draft.nameAr,nameEn:draft.nameEn||undefined,parentCode:draft.parentCode||null,visualKey:draft.visualKey,isFeatured:draft.isFeatured,status:draft.status,sortOrder:Number(draft.sortOrder)};if(editing)await categoryAdminApi.update(editing,payload);else await categoryAdminApi.create({code:draft.code,...payload});const refreshed=await categoryAdminApi.list();setCategories(refreshed.categories);setNotice(editing?'تم تحديث التصنيف.':'تم إنشاء التصنيف.');setEditing(undefined);setDraft(empty);}catch(c){setError(c instanceof Error?c.message:'تعذر حفظ التصنيف.');}finally{setSaving(false);}}
  async function toggle(category:AdminCategory){setError('');try{const result=await categoryAdminApi.update(category.code,{status:category.status==='active'?'inactive':'active'});setCategories(current=>current.map(c=>c.code===category.code?result.category:c));}catch(c){setError(c instanceof Error?c.message:'تعذر تغيير حالة التصنيف.');}}
  async function feature(category:AdminCategory){try{const result=await categoryAdminApi.update(category.code,{isFeatured:!category.isFeatured});setCategories(current=>current.map(c=>c.code===category.code?result.category:c));}catch(c){setError(c instanceof Error?c.message:'تعذر تحديث الإبراز.');}}
  if(loading)return <main className="operations-shell"><section className="operations-panel"><p>جاري تحميل التصنيفات…</p></section></main>;
  return <main id="foundation-content" className="operations-shell" dir="rtl">
    <header className="operations-header"><div><p className="eyebrow">خدمة · Taxonomy Control</p><h1>إدارة التصنيفات</h1><p>إدارة البنية الهرمية والترتيب والإبراز والتفعيل دون حذف المراجع المستخدمة في المنصة.</p></div><span className="status-badge">Product V2</span></header>
    <nav className="admin-navigation"><Link href="/admin">لوحة الإدارة</Link><Link href="/categories">واجهة التصنيفات العامة</Link></nav>
    {error?<p className="form-error" role="alert">{error}</p>:null}{notice?<p role="status">{notice}</p>:null}
    <section className="operations-summary"><article><strong>{stats.total}</strong><span>إجمالي</span></article><article><strong>{stats.active}</strong><span>نشط</span></article><article><strong>{stats.featured}</strong><span>مميز</span></article><article><strong>{stats.roots}</strong><span>مجالات رئيسية</span></article></section>
    <section className="operations-grid">
      <article className="operations-panel"><div className="panel-heading"><h2>{editing?'تعديل التصنيف':'تصنيف جديد'}</h2><span>{editing?editing:'جديد'}</span></div><form className={styles.form} onSubmit={submit}>
        <label>الكود<input value={draft.code} disabled={!!editing} onChange={e=>setDraft(d=>({...d,code:e.target.value}))} placeholder="restaurant_services" required/></label>
        <label>الاسم العربي<input value={draft.nameAr} onChange={e=>setDraft(d=>({...d,nameAr:e.target.value}))} required/></label>
        <label>الاسم الإنكليزي<input value={draft.nameEn} onChange={e=>setDraft(d=>({...d,nameEn:e.target.value}))}/></label>
        <label>التصنيف الأب<select value={draft.parentCode} onChange={e=>setDraft(d=>({...d,parentCode:e.target.value}))}><option value="">مجال رئيسي</option>{roots.filter(r=>r.code!==editing).map(r=><option key={r.code} value={r.code}>{r.nameAr}</option>)}</select></label>
        <label>Visual key<input value={draft.visualKey} onChange={e=>setDraft(d=>({...d,visualKey:e.target.value}))} required/></label>
        <label>الترتيب<input type="number" min="0" max="100000" value={draft.sortOrder} onChange={e=>setDraft(d=>({...d,sortOrder:Number(e.target.value)}))}/></label>
        <label className={styles.checkbox}><input type="checkbox" checked={draft.isFeatured} onChange={e=>setDraft(d=>({...d,isFeatured:e.target.checked}))}/> مميز في الواجهة</label>
        <label>الحالة<select value={draft.status} onChange={e=>setDraft(d=>({...d,status:e.target.value as Draft['status']}))}><option value="active">نشط</option><option value="inactive">غير نشط</option></select></label>
        <div className={`${styles.actions} ${styles.wide}`}><button className="foundation-action" disabled={saving}>{saving?'جاري الحفظ…':editing?'حفظ التعديل':'إنشاء التصنيف'}</button>{editing?<button type="button" onClick={reset}>إلغاء</button>:null}</div>
      </form></article>
      <article className="operations-panel"><div className="panel-heading"><h2>البحث والهيكل</h2><span>{filtered.length}</span></div><div className={styles.toolbar}><label className={styles.searchBox}>ابحث بالكود أو الاسم<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="مطاعم، توصيل، restaurant…"/></label><p className={styles.hint}>لا يتم حذف التصنيفات المستخدمة. التعطيل يحافظ على العلاقات التاريخية ويمنع الظهور العام الجديد.</p></div></article>
    </section>
    <section className="operations-panel"><div className="panel-heading"><h2>شجرة التصنيفات</h2><span>Roots / Children</span></div><div className={styles.list}>{filtered.map(category=><article key={category.code} className={styles.row}><div className={styles.rowInfo}><strong>{category.nameAr}</strong><small>{category.code}{category.parentCode?` ← ${category.parentCode}`:' · رئيسي'}</small></div><div className={styles.rowMeta}><span className="status-badge">{category.status==='active'?'نشط':'متوقف'}</span>{category.isFeatured?<span className="status-badge">مميز</span>:null}<small>#{category.sortOrder}</small></div><div className={styles.actions}><button onClick={()=>edit(category)}>تعديل</button><button onClick={()=>void feature(category)}>{category.isFeatured?'إلغاء الإبراز':'إبراز'}</button><button onClick={()=>void toggle(category)}>{category.status==='active'?'تعطيل':'تفعيل'}</button></div></article>)}{!filtered.length?<p className={styles.empty}>لا توجد نتائج مطابقة.</p>:null}</div></section>
  </main>;
}
