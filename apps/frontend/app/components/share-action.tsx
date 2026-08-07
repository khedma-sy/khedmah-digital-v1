'use client';

import { useState } from 'react';

export function ShareAction({ title, text, className = 'experience-action experience-action-secondary' }: Readonly<{ title: string; text: string; className?: string }>) {
  const [status, setStatus] = useState('');

  async function share() {
    const data = { title, text, url: window.location.href };
    if (navigator.share) {
      await navigator.share(data);
      return;
    }
    await navigator.clipboard.writeText(data.url);
    setStatus('تم نسخ الرابط');
  }

  return (
    <span className="share-action-wrap">
      <button type="button" className={className} onClick={() => void share()}>أنا مع خدمة · مشاركة</button>
      {status ? <span role="status" className="share-action-status">{status}</span> : null}
    </span>
  );
}
