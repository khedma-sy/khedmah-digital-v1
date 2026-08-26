import Link from 'next/link';
import type { ButtonHTMLAttributes, FormHTMLAttributes, ReactNode } from 'react';

export function PageShell({ children, label, className = '' }: { children: ReactNode; label?: string; className?: string }) {
  return <main id="foundation-content" className={`ui-page ${className}`.trim()} aria-label={label}>
    <div className="ui-container">{children}</div>
  </main>;
}

export function PageHeader({ title, description, eyebrow, backHref, actions }: { title: string; description?: string; eyebrow?: string; backHref?: string; actions?: ReactNode }) {
  return <header className="ui-page-header">
    <div className="ui-page-heading">
      {backHref ? <Link className="ui-back" href={backHref} aria-label="العودة">←</Link> : null}
      <div>{eyebrow ? <span className="ui-eyebrow">{eyebrow}</span> : null}<h1>{title}</h1>{description ? <p>{description}</p> : null}</div>
    </div>
    {actions ? <div className="ui-page-actions">{actions}</div> : null}
  </header>;
}

type SurfaceProps = {
  children: ReactNode;
  as?: 'section' | 'article' | 'aside' | 'div' | 'form';
  className?: string;
} & Pick<FormHTMLAttributes<HTMLFormElement>, 'onSubmit' | 'aria-busy'>;

export function Surface({ children, as = 'section', className = '', onSubmit, 'aria-busy': ariaBusy }: SurfaceProps) {
  const surfaceClassName = `ui-surface ${className}`.trim();
  if (as === 'form') {
    return <form className={surfaceClassName} onSubmit={onSubmit} aria-busy={ariaBusy}>{children}</form>;
  }
  const Element = as;
  return <Element className={surfaceClassName}>{children}</Element>;
}

export function ActionLink({ href, children, variant = 'primary' }: { href: string; children: ReactNode; variant?: 'primary' | 'secondary' | 'quiet' }) {
  return <Link href={href} className={`ui-action ui-action-${variant}`}>{children}</Link>;
}

export function ActionButton({ children, variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  return <button className={`ui-action ui-action-${variant} ${className}`.trim()} {...props}>{children}</button>;
}

export function StatusMessage({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'success' | 'warning' | 'danger' }) {
  return <div className={`ui-status ui-status-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>{children}</div>;
}

export function EmptyState({ icon, title, description, actions }: { icon?: ReactNode; title: string; description: string; actions?: ReactNode }) {
  return <Surface className="ui-empty">
    {icon ? <span className="ui-empty-icon" aria-hidden="true">{icon}</span> : null}
    <h2>{title}</h2>
    <p>{description}</p>
    {actions ? <div className="ui-empty-actions">{actions}</div> : null}
  </Surface>;
}

export function SkeletonGrid({ count = 4, label = 'جاري تحميل المحتوى' }: { count?: number; label?: string }) {
  return <div className="ui-grid" aria-busy="true" aria-label={label}>
    {Array.from({ length: count }, (_, index) => <div className="ui-skeleton" key={index} />)}
  </div>;
}
