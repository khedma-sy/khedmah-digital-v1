import Link from 'next/link';
import { BrandMark } from './brand-mark';
import { PlatformIcon } from './platform-icon';
import styles from './service-product-header.module.css';

export function ServiceProductHeader({ title, label, tone }: { title: string; label: string; tone: 'blue' | 'green' }) {
  return <header className={`${styles.header} ${styles[tone]}`}>
    <Link href="/" className={styles.parentBrand} aria-label="العودة إلى منصة خدمة"><BrandMark compact/></Link>
    <div className={styles.identity}><span><PlatformIcon name={tone === 'green' ? 'pin' : 'search'} size={22}/></span><div><small>{label}</small><strong>{title}</strong></div></div>
    <Link href="/" className={styles.homeLink}><PlatformIcon name="arrow" size={17}/> الرئيسية</Link>
  </header>;
}
