type BrandMarkProps = { compact?: boolean };
type BrandUmbrellaProps = { className?: string };

export function BrandUmbrella({ className }: BrandUmbrellaProps) {
  return (
    <svg className={className} viewBox="0 0 120 126" aria-hidden="true">
      <path d="M11 55C15 28 35 9 60 9c-9 9-15 26-17 47-9-7-22-7-32-1Z" fill="#12679d" stroke="#f8fbff" strokeWidth="2.8" strokeLinejoin="round" />
      <path d="M43 56C45 34 51 17 60 9c9 8 15 25 17 47-10-9-24-9-34 0Z" fill="#81be49" stroke="#f8fbff" strokeWidth="2.8" strokeLinejoin="round" />
      <path d="M77 56C75 34 69 17 60 9c25 0 45 19 49 46-10-6-22-6-32 1Z" fill="#fd9603" stroke="#f8fbff" strokeWidth="2.8" strokeLinejoin="round" />
      <path d="M11 55C15 28 35 9 60 9s45 19 49 46c-10-6-22-6-32 1-10-9-24-9-34 0-9-7-22-7-32-1Z" fill="none" stroke="#f8fbff" strokeWidth="4.5" strokeLinejoin="round" />
      <path d="M60 55v39c0 12 17 13 17 1" fill="none" stroke="#f8fbff" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M60 55v39c0 12 17 13 17 1" fill="none" stroke="#81be49" strokeWidth="4.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function BrandMark({ compact = false }: BrandMarkProps) {
  return (
    <span className={`khedma-brand${compact ? ' khedma-brand-compact' : ''}`} aria-label="خدمة - تحت مظلة واحدة">
      <BrandUmbrella />
      <span><b>خدمة</b><small>تحت مظلة واحدة</small></span>
    </span>
  );
}
