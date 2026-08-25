'use client';

import React, { useEffect, useState } from 'react';
import { api, PublicBusinessProfile, PublicProfessionalProfile } from '../../../lib/api-client';

export default function ModerationPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [businesses, setBusinesses] = useState<PublicBusinessProfile[]>([]);
  const [professionals, setProfessionals] = useState<PublicProfessionalProfile[]>([]);
  const [rejectingEntity, setRejectingEntity] = useState<{ type: 'business' | 'professional'; id: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const messageFor = (value: unknown, fallback: string) => value instanceof Error ? value.message : fallback;

  const loadQueue = async () => {
    setLoading(true);
    try {
      const { businesses, professionals } = await api.moderation.listPending();
      setBusinesses(businesses);
      setProfessionals(professionals);
      setError(null);
    } catch (err: unknown) {
      setError(messageFor(err, 'حدث خطأ أثناء تحميل قائمة المراجعة'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQueue();
  }, []);

  const handleApprove = async (type: 'business' | 'professional', id: string) => {
    if (!confirm('هل أنت متأكد من الموافقة على هذا الملف؟')) return;
    setActionLoading(true);
    try {
      if (type === 'business') {
        await api.businesses.approveModeration(id);
      } else {
        await api.professionals.approveModeration(id);
      }
      await loadQueue();
    } catch (err: unknown) {
      alert(messageFor(err, 'حدث خطأ أثناء الموافقة'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectingEntity || !rejectReason.trim()) return;
    setActionLoading(true);
    try {
      if (rejectingEntity.type === 'business') {
        await api.businesses.rejectModeration(rejectingEntity.id, rejectReason);
      } else {
        await api.professionals.rejectModeration(rejectingEntity.id, rejectReason);
      }
      setRejectingEntity(null);
      setRejectReason('');
      await loadQueue();
    } catch (err: unknown) {
      alert(messageFor(err, 'حدث خطأ أثناء الرفض'));
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <main id="foundation-content" className="operations-shell moderation-state" aria-busy="true">جاري تحميل قائمة المراجعة...</main>;
  if (error) return <main id="foundation-content" className="operations-shell moderation-state form-error" role="alert">{error}</main>;

  return (
    <main id="foundation-content" className="operations-shell moderation-page" dir="rtl">
      <header className="operations-header"><div><p className="eyebrow">خدمة · الإشراف</p><h1>إدارة المراجعة</h1><p>مراجعة ملفات الأعمال والمهنيين قبل إتاحتها للمستخدمين.</p></div><span className="status-badge">{businesses.length + professionals.length} بانتظار المراجعة</span></header>

      <section className="operations-panel moderation-section">
        <div className="panel-heading"><h2>الأعمال المعلقة</h2><span>{businesses.length}</span></div>
        {businesses.length === 0 ? (
          <p className="moderation-empty">لا توجد أعمال بانتظار المراجعة.</p>
        ) : (
          <div className="moderation-list">
            {businesses.map((b) => (
              <article key={b.id} className="moderation-card">
                <div>
                  <h3>{b.name}</h3>
                  <p>{b.categoryCode} · {b.cityCode}</p>
                </div>
                <div className="moderation-actions">
                  <button
                    onClick={() => handleApprove('business', b.id)}
                    disabled={actionLoading}
                    className="moderation-approve"
                  >
                    موافقة
                  </button>
                  <button
                    onClick={() => setRejectingEntity({ type: 'business', id: b.id })}
                    disabled={actionLoading}
                    className="moderation-reject"
                  >
                    رفض
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="operations-panel moderation-section">
        <div className="panel-heading"><h2>المهنيون المعلقون</h2><span>{professionals.length}</span></div>
        {professionals.length === 0 ? (
          <p className="moderation-empty">لا يوجد مهنيون بانتظار المراجعة.</p>
        ) : (
          <div className="moderation-list">
            {professionals.map((p) => (
              <article key={p.id} className="moderation-card">
                <div>
                  <h3>{p.headlineAr}</h3>
                  <p>{p.cityCode} · {p.skills.join('، ')}</p>
                </div>
                <div className="moderation-actions">
                  <button
                    onClick={() => handleApprove('professional', p.id)}
                    disabled={actionLoading}
                    className="moderation-approve"
                  >
                    موافقة
                  </button>
                  <button
                    onClick={() => setRejectingEntity({ type: 'professional', id: p.id })}
                    disabled={actionLoading}
                    className="moderation-reject"
                  >
                    رفض
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {rejectingEntity && (
        <div className="moderation-dialog-backdrop" role="presentation">
          <section className="moderation-dialog" role="dialog" aria-modal="true" aria-labelledby="reject-title" dir="rtl">
            <h3 id="reject-title">سبب الرفض</h3>
            <textarea
              className="moderation-reason"
              rows={4}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="يرجى كتابة سبب الرفض هنا..."
            />
            <div className="moderation-actions">
              <button
                onClick={() => { setRejectingEntity(null); setRejectReason(''); }}
                className="filter-action-secondary"
              >
                إلغاء
              </button>
              <button
                onClick={handleReject}
                disabled={actionLoading || !rejectReason.trim()}
                className="moderation-reject"
              >
                تأكيد الرفض
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
