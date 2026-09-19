import { redirect } from 'next/navigation';
import { legacyDiscoveryHref } from '../../lib/legacy-discovery-redirect';

export default async function LegacyServiceCatalogPage({ searchParams }: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(legacyDiscoveryHref('/categories', await searchParams));
}
