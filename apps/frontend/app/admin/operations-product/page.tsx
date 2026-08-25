import Link from 'next/link';
const sections = [
  ['Infrastructure Overview', 'نظرة البنية التحتية', 'Cloud Run، Cloud Build، Artifact Registry، الشبكات، النطاقات والشهادات'],
  ['Google Cloud', 'Google Cloud', 'المشروعات، الخدمات، حسابات الخدمة وواجهات Google APIs'],
  ['Firebase', 'Firebase', 'Authentication، Messaging، Analytics، Crashlytics، Remote Config وApp Check'],
  ['CI/CD', 'CI/CD', 'مسارات البناء والنشر والإصدار والتراجع'],
  ['Production', 'الإنتاج', 'حالة الخدمات، السعة، الأداء والتوافر'],
  ['Monitoring', 'المراقبة', 'Cloud Monitoring، المقاييس، التنبيهات والحوادث'],
  ['Security', 'الأمن', 'IAM، الأسرار، الشهادات، سجلات التدقيق ومراجعات الوصول'],
  ['Releases', 'الإصدارات', 'سجل الإصدارات واعتمادات التغيير'],
  ['Deployments', 'عمليات النشر', 'سجل النشر وطلبات التراجع'],
  ['Secrets', 'الأسرار', 'مراجع Secret Manager فقط دون عرض القيم'],
  ['IAM', 'الصلاحيات', 'RBAC وأقل صلاحية وفصل الواجبات'],
  ['Logs', 'السجلات', 'سجلات تشغيل منقحة من البيانات الحساسة'],
  ['Alerts', 'التنبيهات', 'تنبيهات الصحة والأمن والسعة'],
  ['Incidents', 'الحوادث', 'التصعيد والاستجابة والتعافي'],
  ['Build History', 'سجل البناء', 'نتائج Cloud Build والأدلة'],
  ['Deployment History', 'سجل النشر', 'البيئة والإصدار والحالة'],
  ['RBAC', 'التحكم بالوصول', 'أدوار Operations Product المخصصة']
] as const;
export default function OperationsProductPage() {
  return <main id="foundation-content" className="operations-shell">
    <header className="operations-header"><div><p className="eyebrow">خدمة · الإدارة</p><h1>مركز العمليات</h1><p>مركز عمليات البنية التحتية والإنتاج مع صلاحيات مقيدة وتدقيق كامل.</p></div><span className="status-badge">جاهز للتهيئة · غير مفعّل للإنتاج</span></header>
    <nav className="admin-navigation" aria-label="التنقل الإداري"><Link href="/">الرئيسية</Link><a href="#infrastructure">البنية التحتية</a><a href="#monitoring">المراقبة</a><a href="#security">الأمن</a><a href="#releases">الإصدارات</a></nav>
    <section className="operations-summary" aria-label="ملخص العمليات"><article><strong>0</strong><span>حوادث مفتوحة</span></article><article><strong>0</strong><span>تغييرات معلقة</span></article><article><strong>مغلق</strong><span>حركة الإنتاج</span></article><article><strong>RBAC</strong><span>الوصول الإداري</span></article></section>
    <section className="operations-grid" id="infrastructure" aria-label="لوحات Operations Product">{sections.map(([key, title, description]) => <article className="operations-panel" id={key === 'Monitoring' ? 'monitoring' : key === 'Security' ? 'security' : key === 'Releases' ? 'releases' : undefined} key={key}><div className="panel-heading"><h2>{title}</h2><span>مقيد</span></div><p>{description}</p><button type="button" disabled title="يتطلب جلسة إدارية وصلاحية معتمدة">يتطلب صلاحية معتمدة</button></article>)}</section>
  </main>;
}
