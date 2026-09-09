'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);
  function close() {
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  }

  function go(value: string) {
    const text = value.trim();
    if (!text) return setMessage('اكتب الخدمة أو الإعلان الذي تبحث عنه.');
    setOpen(false);
    if (/تكسي|تاكسي|سيارة|سائق/.test(text)) return router.push('/taxi');
    if (/مندوب|توصيل|شحن/.test(text)) return router.push('/mobility?type=delivery');
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

  return <aside className={styles.root} data-khedmah-assistant="true" aria-label="مساعد خدمة الذكي" onKeyDown={(event) => {
    if (event.key === 'Escape' && open) { event.preventDefault(); close(); }
  }}>
    <button ref={triggerRef} className={styles.trigger} type="button" onClick={() => { if (open) close(); else setOpen(true); }} aria-label={open ? 'إغلاق مساعد خدمة' : 'فتح مساعد خدمة'} aria-expanded={open} aria-controls={open ? 'khedmah-assistant-panel' : undefined}>☂ <span>اسأل خدمة</span></button>
    {open && <div id="khedmah-assistant-panel" className={styles.panel} role="region" aria-label="طلب المساعدة"><div className={styles.heading}><strong>مساعد خدمة</strong><button type="button" onClick={close} aria-label="إغلاق المساعد">×</button></div><p>{message}</p><form onSubmit={submit}><input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="مثال: أريد تكسي إلى دمشق" aria-label="طلبك للمساعد"/><div className={styles.actions}><button type="button" onClick={listen} aria-pressed={listening}>{listening ? 'جاري الاستماع…' : '🎙 تحدث'}</button><button type="submit">اعثر عليها</button></div></form><div className={styles.quick}><button onClick={() => go('تكسي')} type="button">تكسي</button><button onClick={() => go('مندوب توصيل')} type="button">مندوب</button><button onClick={() => go('إعلانات')} type="button">إعلانات</button></div><small>لا يتم حفظ التسجيل الصوتي داخل خدمة.</small></div>}
  </aside>;
}
