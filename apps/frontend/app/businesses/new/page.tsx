import { redirect } from 'next/navigation';

export default function LegacyNewBusinessRedirectPage() {
  redirect('/business-profiles/new');
}
