'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api } from '../../../lib/api-client';
import { ActionButton, ActionLink, PageHeader, PageShell, StatusMessage, Surface } from '../../components/ui-primitives';
import styles from '../../../components/owner-workspace.module.css';

export default function CreateOrganizationPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function createOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      const { organization } = await api.organizations.create(name.trim());
      router.push(`/organizations/${organization.id}`);
    } catch (cause) {
      if (cause instanceof Error && (cause as Error & { statusCode?: number }).statusCode === 401) {
        router.replace('/auth/login');
        return;
      }
      setError(cause instanceof Error ? cause.message : 'تعذر إنشاء الجهة. راجع الاسم وحاول مجدداً.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return <PageShell className={styles.page} label="إنشاء مؤسسة أو جهة">
    <div className={styles.formShell}>
      <PageHeader eyebrow="مساحة صاحب النشاط" title="إنشاء مؤسسة أو جهة" description="استخدم الجهة لتنظيم فريق العمل وملفات الأنشطة التابعة له، وليس لإنشاء إعلان عام مستقل."/>
      {error ? <StatusMessage tone="danger">{error}</StatusMessage> : null}
      <div className={styles.formLayout}>
        <Surface as="form" className={styles.form} onSubmit={createOrganization}>
          <section className={styles.section}><h2>معلومات الجهة</h2><p>اكتب الاسم القانوني أو الاسم التنظيمي المعروف للفريق.</p><label>اسم المؤسسة أو الجهة <span className={styles.required}>*</span><input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={120} autoComplete="organization" placeholder="مثال: مؤسسة الأفق للخدمات"/><span className={styles.help}>من حرفين إلى ١٢٠ حرفاً. يمكنك تعديل الاسم لاحقاً إذا كنت مالك الجهة.</span></label></section>
          <footer className={styles.footer}><ActionLink href="/organizations" variant="secondary">إلغاء والعودة</ActionLink><ActionButton type="submit" disabled={isSubmitting || name.trim().length < 2}>{isSubmitting ? 'جارٍ إنشاء الجهة…' : 'إنشاء الجهة'}</ActionButton></footer>
        </Surface>
        <Surface as="aside" className={styles.guide}><h2>استخدم الجهة عندما</h2><ol><li>يوجد أكثر من عضو يدير الأنشطة.</li><li>تحتاج إلى فصل الملكية عن الملف الشخصي.</li><li>تدير عدة ملفات أعمال تابعة لمؤسسة واحدة.</li></ol><p className={styles.notice}>إنشاء الجهة لا ينشر نشاطاً تلقائياً؛ كل ملف نشاط يبقى خاضعاً للمراجعة والاعتماد.</p></Surface>
      </div>
    </div>
  </PageShell>;
}
