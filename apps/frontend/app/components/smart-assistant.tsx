'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PlatformIcon } from './platform-icon';
import { BrandUmbrella } from './brand-mark';
import styles from './smart-assistant.module.css';

type SpeechResult = { 0: { transcript: string } };
type SpeechRecognitionLike = { lang: string; interimResults: boolean; continuous: boolean; start(): void; onresult?: (event: { results: ArrayLike<SpeechResult> }) => void; onerror?: () => void; onend?: () => void };
type SpeechWindow = Window & { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };

export function SmartAssistant() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState('اكتب أو قل ما تحتاجه، وسأقودك إلى المسار المناسب.');

  function go(value: string) {
    const text = value.trim();
    if (!text) return setMessage('اكتب الخدمة أو الإعلان الذي تبحث عنه.');
    if (/تكسي|تاكسي|سيارة|سائق/.test(text)) return router.push('/mobility?type=taxi');
    if (/مندوب|توصيل|شحن/.test(text)) return router.push('/mobility?type=delivery');
    if (/مطعم|طعام|اكل|أكل|شاورما|حلويات|مخبز/.test(text)) return router.push(`/restaurants?q=${encodeURIComponent(text)}`);
    if (/خصم|عرض|عروض|تخفيض/.test(text)) return router.push(`/promotions?q=${encodeURIComponent(text)}`);
    if (/إعلان|اعلان|منتج|بيع|شراء|مستعمل/.test(text)) return router.push(`/classifieds?q=${encodeURIComponent(text)}`);
    router.push(`/search?q=${encodeURIComponent(text)}`);
  }

  function submit(event: FormEvent) { event.preventDefault(); go(query); }
  function listen() {
    const runtime = window as SpeechWindow;
    const Recognition = runtime.SpeechRecognition ?? runtime.webkitSpeechRecognition;
    if (!Recognition) return setMessage('الإملاء الصوتي غير مدعوم في هذا المتصفح. يمكنك الكتابة بدلًا منه.');
    const recognition = new Recognition();
    recognition.lang = 'ar-SY'; recognition.interimResults = false; recognition.continuous = false;
    recognition.onresult = (event) => { const text = event.results[0]?.[0]?.transcript ?? ''; setQuery(text); setMessage(`سمعت: ${text}`); };
    recognition.onerror = () => setMessage('تعذر سماع الكلام. تحقق من إذن الميكروفون وحاول مجددًا.');
    recognition.onend = () => setListening(false);
    setListening(true); recognition.start();
  }

  return <aside className={`${styles.root} smart-assistant`} aria-label="مساعد خدمة الذكي">
    {open && <div className={styles.panel}><div className={styles.heading}><strong><PlatformIcon name="sparkles" size={19}/>مساعد خدمة</strong><button type="button" onClick={() => setOpen(false)} aria-label="إغلاق المساعد"><PlatformIcon name="close"/></button></div><p>{message}</p><form onSubmit={submit}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="مثال: أريد مطعمًا قريبًا أو تكسي إلى دمشق" aria-label="طلبك للمساعد"/><div className={styles.actions}><button type="button" onClick={listen} aria-pressed={listening}><PlatformIcon name="microphone" size={18}/>{listening ? 'جاري الاستماع…' : 'تحدث'}</button><button type="submit"><PlatformIcon name="search" size={18}/>اعثر عليها</button></div></form><div className={styles.quick} aria-label="مسارات سريعة"><button onClick={() => go('طعام')} type="button"><PlatformIcon name="food" size={17}/>طعام</button><button onClick={() => go('تكسي')} type="button"><PlatformIcon name="car" size={17}/>تكسي</button><button onClick={() => go('مندوب توصيل')} type="button"><PlatformIcon name="delivery" size={17}/>مندوب</button><button onClick={() => go('عروض')} type="button"><PlatformIcon name="tag" size={17}/>عروض</button><button onClick={() => go('إعلانات')} type="button"><PlatformIcon name="storefront" size={17}/>متاجر</button></div><small>الإملاء اختياري، ولا يتم حفظ التسجيل الصوتي داخل خدمة.</small></div>}
    <button className={styles.trigger} type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={open ? 'إغلاق مساعد خدمة' : 'فتح مساعد خدمة'}><BrandUmbrella className={styles.brandIcon}/><span>اسأل خدمة</span></button>
  </aside>;
}
