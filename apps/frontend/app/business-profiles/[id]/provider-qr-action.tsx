'use client';

import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';

export function ProviderQrAction({ providerName }: { providerName: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [qrUrl, setQrUrl] = useState('');

  useEffect(() => {
    const target = new URL(window.location.href);
    target.searchParams.set('source', 'qr');
    void QRCode.toDataURL(target.toString(), { width: 320, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#06121a', light: '#ffffff' } }).then(setQrUrl);
  }, []);

  return <>
    <button type="button" className="filter-action-secondary" onClick={() => dialog.current?.showModal()}>▦ رمز QR</button>
    <dialog ref={dialog} className="provider-qr-dialog" onClick={(event) => { if (event.target === dialog.current) dialog.current.close(); }}>
      <button type="button" aria-label="إغلاق" onClick={() => dialog.current?.close()}>×</button>
      <h2>افتح ملف {providerName}</h2>
      <p>امسح الرمز للانتقال إلى موقع مقدم الخدمة ثم إرسال الطلب.</p>
      {qrUrl && <img src={qrUrl} alt={`رمز QR لملف ${providerName}`} width="320" height="320" />}
    </dialog>
  </>;
}
