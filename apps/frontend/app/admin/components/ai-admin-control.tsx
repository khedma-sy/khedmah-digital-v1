'use client';

import { useEffect, useState } from 'react';
import { aiAdminApi, type AiAdminStatus } from '../../../lib/ai-admin-client';
import styles from './ai-admin-control.module.css';

const modeLabel: Record<string, string> = {
  executive: 'Executive',
  expose: 'Expose',
  killcritic: 'KillCritic',
  autopsy: 'Autopsy'
};

export function AiAdminControl() {
  const [status, setStatus] = useState<AiAdminStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void aiAdminApi.status()
      .then(({ aiAdmin }) => { if (active) setStatus(aiAdmin); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'تعذر تحميل حالة المدير الذكي.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function toggle() {
    if (!status || saving) return;
    setSaving(true);
    setError('');
    try {
      const { aiAdmin } = await aiAdminApi.setEnabled(!status.enabled);
      setStatus(aiAdmin);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تغيير حالة المدير الذكي.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <section className="operations-panel" aria-busy="true"><p>جاري تحميل حالة المدير الذكي…</p></section>;
  if (!status) return <section className="operations-panel"><p className={styles.error} role="alert">{error || 'تعذر فتح تحكم المدير الذكي.'}</p></section>;

  const budget = (status.monthlyBudgetUsdCents / 100).toFixed(2);
  const runtimeMessage = status.executionAvailable
    ? 'محرك التنفيذ متاح وتخضع إجراءاته لصلاحيات الخادم.'
    : 'مرحلة التحكم جاهزة، لكن محرك OpenAI التنفيذي لم يُفعّل بعد؛ الزر يحفظ قرار المالك ويعمل كأساس لمفتاح الإيقاف الخادمي.';

  return <section className={`operations-panel ${styles.control}`} aria-label="تحكم المدير الذكي">
    <div className={styles.header}>
      <div className={styles.title}>
        <h2>Khedmah AI Admin</h2>
        <p>مدير عمليات ذكي داخلي بصلاحيات مقيدة، مراقبة تكلفة، وسجل تدقيق.</p>
      </div>
      <span className={styles.badge} data-enabled={status.enabled}>{status.enabled ? 'مفعّل' : 'متوقف'}</span>
    </div>

    <div className={styles.metrics} aria-label="حالة المدير الذكي">
      <div><strong>${budget}</strong><span>السقف الشهري</span></div>
      <div><strong>{status.providerConfigured ? 'مضبوط' : 'غير مربوط'}</strong><span>OpenAI API</span></div>
      <div><strong>{status.operatingMode === 'supervised' ? 'تحت الإشراف' : status.operatingMode}</strong><span>نمط التشغيل</span></div>
    </div>

    <div className={styles.modes} aria-label="أنماط التحليل">
      {status.analysisModes.map((mode) => <span key={mode}>{modeLabel[mode] ?? mode}</span>)}
    </div>

    <p className={styles.notice}>{runtimeMessage} لا يملك المدير الذكي وصولاً مباشراً إلى كلمات المرور أو الأسرار أو قاعدة البيانات أو Production.</p>

    <div className={styles.actions}>
      <button className={styles.toggle} data-enabled={status.enabled} type="button" aria-pressed={status.enabled} disabled={saving} onClick={() => void toggle()}>
        {saving ? 'جاري الحفظ…' : status.enabled ? 'تعطيل المدير الذكي' : 'تفعيل المدير الذكي'}
      </button>
    </div>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
  </section>;
}
