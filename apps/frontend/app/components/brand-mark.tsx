type BrandMarkProps = {
  compact?: boolean;
  className?: string;
};

export function BrandMark({ compact = false, className = '' }: BrandMarkProps) {
  return (
    <span className={`khedma-brand-mark${compact ? ' khedma-brand-mark-compact' : ''}${className ? ` ${className}` : ''}`} aria-label="خدمة">
      <svg className="khedma-umbrella" viewBox="0 0 120 126" role="img" aria-hidden="true">
        <path d="M14 53C18 27 36 10 60 10s42 17 46 43c-11-8-23-10-34-3-7-9-17-9-24 0-11-7-23-5-34 3Z" fill="#0B3A6F" />
        <path d="M48 50c3-22 7-34 12-40 6 7 10 19 12 40-8-8-16-8-24 0Z" fill="#39A96B" />
        <path d="M72 50c11-7 23-5 34 3-4-20-14-33-28-39 4 9 7 21 8 36-5-2-9-2-14 0Z" fill="#F36A3D" />
        <path d="M60 10v62" stroke="#0B3A6F" strokeWidth="5" strokeLinecap="round" />
        <path d="M60 72v24c0 11 16 11 16 0" fill="none" stroke="#0B3A6F" strokeWidth="5" strokeLinecap="round" />
      </svg>
      <span className="khedma-wordmark">خدمة</span>
    </span>
  );
}
