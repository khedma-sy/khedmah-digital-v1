'use client';

import { useState } from 'react';
import { buildKhedmaShareText } from '../../lib/launch-campaign';

export function ShareAction({ title, text, className = 'experience-action experience-action-secondary' }: Readonly<{ title: string; text: string; className?: string }>) {
  const [status, setStatus] = useState('');

  async function share() {
    const url = window.location.href;
    const brandedText = buildKhedmaShareText(text || title, url);
    const data = { title: `☂ خدمة | ${title}`, text: brandedText, url };
    if (navigator.share) {
      await navigator.share(data);
      return;
    }
    await navigator.clipboard.writeText(brandedText);
    setStatus('تم نسخ رسالة المشاركة والرابط');
  }

  return (
    <span className="share-action-wrap">
      <button type="button" className={className} onClick={() => void share()}>خدمة · مشاركة</button>
      {status ? <span role="status" className="share-action-status">{status}</span> : null}
    </span>
  );
}
