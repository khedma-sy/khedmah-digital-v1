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

  const loadQueue = async () => {
    setLoading(true);
    try {
      const { businesses, professionals } = await api.moderation.listPending();
      setBusinesses(businesses);
      setProfessionals(professionals);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'حدث خطأ أثناء تحميل قائمة المراجعة');
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
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء الموافقة');
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
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء الرفض');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <div className="p-8 text-center">جاري التحميل...</div>;
  if (error) return <div className="p-8 text-center text-red-600">{error}</div>;

  return (
    <div className="container mx-auto p-6" dir="rtl">
      <h1 className="text-3xl font-bold mb-8">إدارة المراجعة</h1>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4 text-blue-800 border-b pb-2">الشركات المعلقة ({businesses.length})</h2>
        {businesses.length === 0 ? (
          <p className="text-gray-500 italic">لا توجد شركات بانتظار المراجعة.</p>
        ) : (
          <div className="grid gap-4">
            {businesses.map((b) => (
              <div key={b.id} className="bg-white p-4 rounded-lg shadow border flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-lg">{b.name}</h3>
                  <p className="text-sm text-gray-600">{b.categoryCode} | {b.cityCode}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApprove('business', b.id)}
                    disabled={actionLoading}
                    className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50"
                  >
                    موافقة
                  </button>
                  <button
                    onClick={() => setRejectingEntity({ type: 'business', id: b.id })}
                    disabled={actionLoading}
                    className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 disabled:opacity-50"
                  >
                    رفض
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4 text-green-800 border-b pb-2">المحترفون المعلقون ({professionals.length})</h2>
        {professionals.length === 0 ? (
          <p className="text-gray-500 italic">لا يوجد محترفون بانتظار المراجعة.</p>
        ) : (
          <div className="grid gap-4">
            {professionals.map((p) => (
              <div key={p.id} className="bg-white p-4 rounded-lg shadow border flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-lg">{p.headlineAr}</h3>
                  <p className="text-sm text-gray-600">{p.cityCode} | {p.skills.join(', ')}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApprove('professional', p.id)}
                    disabled={actionLoading}
                    className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50"
                  >
                    موافقة
                  </button>
                  <button
                    onClick={() => setRejectingEntity({ type: 'professional', id: p.id })}
                    disabled={actionLoading}
                    className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 disabled:opacity-50"
                  >
                    رفض
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {rejectingEntity && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md" dir="rtl">
            <h3 className="text-xl font-bold mb-4">سبب الرفض</h3>
            <textarea
              className="w-full border p-2 rounded mb-4"
              rows={4}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="يرجى كتابة سبب الرفض هنا..."
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setRejectingEntity(null); setRejectReason(''); }}
                className="px-4 py-2 border rounded hover:bg-gray-100"
              >
                إلغاء
              </button>
              <button
                onClick={handleReject}
                disabled={actionLoading || !rejectReason.trim()}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
              >
                تأكيد الرفض
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
