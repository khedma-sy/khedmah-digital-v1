'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ActionButton, StatusMessage } from '../components/ui-primitives';
import { PlatformIcon } from '../components/platform-icon';
import styles from './promotions.module.css';

type Detector = { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> };

export function PromotionScanner() {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | undefined>(undefined);
  const timer = useRef<number | undefined>(undefined);
  const [code, setCode] = useState('');
  const [active, setActive] = useState(false);
  const [error, setError] = useState('');

  function open(value: string) {
    const match = value.toUpperCase().match(/KHD-[A-F0-9]{12}/);
    if (!match) { setError('الرمز ليس رمز خصومات خدمة صالحًا.'); return; }
    stop();
    router.push(`/promotions?code=${encodeURIComponent(match[0])}`);
  }

  function stop() {
    if (timer.current) window.clearInterval(timer.current);
    stream.current?.getTracks().forEach((track) => track.stop());
    setActive(false);
  }

  async function start() {
    setError('');
    const DetectorConstructor = (window as unknown as { BarcodeDetector?: new(options: { formats: string[] }) => Detector }).BarcodeDetector;
    if (!DetectorConstructor) { setError('المتصفح لا يدعم المسح المباشر. أدخل الرمز المكتوب أسفل QR.'); return; }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      if (video.current) { video.current.srcObject = stream.current; await video.current.play(); }
      const detector = new DetectorConstructor({ formats: ['qr_code'] });
      setActive(true);
      timer.current = window.setInterval(() => {
        if (video.current) void detector.detect(video.current).then((result) => { if (result[0]) open(result[0].rawValue); }).catch(() => undefined);
      }, 600);
    } catch {
      setError('تعذر تشغيل الكاميرا. اسمح بالوصول أو أدخل الرمز يدويًا.');
    }
  }

  useEffect(() => () => stop(), []);

  function submit(event: FormEvent) {
    event.preventDefault();
    open(code);
  }

  return <div className={styles.scanner}>
    {active && <video ref={video} muted playsInline aria-label="معاينة كاميرا مسح رمز خدمة" className={styles.scannerVideo}/>}
    <div className={styles.scannerOptions}>
      <div className={styles.scannerCamera}>{!active ? <ActionButton type="button" onClick={() => void start()}><PlatformIcon name="qr" size={18}/>فتح قارئ QR</ActionButton> : <ActionButton type="button" variant="secondary" onClick={stop}><PlatformIcon name="close" size={18}/>إيقاف الكاميرا</ActionButton>}</div>
      <div className={styles.optionDivider}><span>أو</span></div>
      <form className={styles.codeForm} onSubmit={submit}>
        <label htmlFor="promotion-business-code">أدخل رمز النشاط</label>
        <div className={styles.codeControl}>
          <input id="promotion-business-code" dir="ltr" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="KHD-000000000000" pattern="KHD-[A-F0-9]{12}" required/>
          <ActionButton type="submit" variant="secondary">فتح العروض</ActionButton>
        </div>
      </form>
    </div>
    {error && <StatusMessage tone="warning">{error}</StatusMessage>}
  </div>;
}
