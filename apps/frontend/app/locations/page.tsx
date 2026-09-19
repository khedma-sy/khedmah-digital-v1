import { redirect } from 'next/navigation';
import { legacyDiscoveryHref } from '../../lib/legacy-discovery-redirect';

export default async function LegacyLocationsPage({ searchParams }: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(legacyDiscoveryHref('/map', await searchParams));
}
