import { redirect } from 'next/navigation';

export default function LegacyServiceCatalogPage() {
  redirect('/categories');
}
