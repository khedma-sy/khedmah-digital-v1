'use client';

export default function GlobalError({ reset }: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <main className="foundation-shell" aria-label="حالة خطأ عامة">
          <section className="foundation-card" role="alert" aria-live="assertive">
            <p className="eyebrow">خدمة</p>
            <h1>تعذر تحميل أساس المنصة</h1>
            <p>حدث خطأ غير متوقع دون عرض أي معلومات داخلية.</p>
            <button className="foundation-action" type="button" onClick={reset}>
              إعادة المحاولة
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
