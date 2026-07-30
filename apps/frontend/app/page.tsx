import Link from 'next/link';

export default function Home() {
  return (
    <main id="foundation-content" className="foundation-shell" aria-label="Khedmah Digital V1 platform foundation">
      <section className="foundation-card">
        <p className="eyebrow">Khedmah Digital V1</p>
        <h1>منصة خدمة الرقمية</h1>
        <p>
          تم تهيئة أساس الواجهة فقط لدعم الاتجاه العربي أولاً واتجاه الكتابة من اليمين إلى اليسار.
        </p>
                <Link className="foundation-action operations-link" href="/admin/operations-product">Operations Product</Link>
      </section>
    </main>
  );
}
