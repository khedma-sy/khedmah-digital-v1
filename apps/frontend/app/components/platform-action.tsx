import Link from 'next/link';
import { PlatformIcon, PlatformIconName } from './platform-icon';

type PlatformActionProps = {
  href: string;
  icon: PlatformIconName;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary';
  className?: string;
};

export function PlatformAction({ href, icon, children, variant = 'primary', className = '' }: PlatformActionProps) {
  return <Link href={href} className={`platform-action platform-action-${variant} ${className}`.trim()}><PlatformIcon name={icon}/><span>{children}</span></Link>;
}
