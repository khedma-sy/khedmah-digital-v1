import Link from 'next/link';

export function DiscoveryCard({ title, description, href, icon }: Readonly<{ title: string; description: string; href: string; icon: string }>) {
  return (
    <Link href={href} className="experience-card discovery-card">
      <span className="experience-icon" aria-hidden="true">{icon}</span>
      <h3>{title}</h3>
      <p>{description}</p>
      <span className="card-link">استكشف ←</span>
    </Link>
  );
}

export function AudienceCard({ label, title, description, action, href }: Readonly<{ label: string; title: string; description: string; action: string; href: string }>) {
  return (
    <article className="experience-card audience-card">
      <span className="audience-label">{label}</span>
      <h3>{title}</h3>
      <p>{description}</p>
      <Link href={href} className="card-link">{action} ←</Link>
    </article>
  );
}

export function TrustBadge({ children }: Readonly<{ children: React.ReactNode }>) {
  return <span className="platform-trust-badge">✓ {children}</span>;
}
