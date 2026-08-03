import { redirect } from 'next/navigation';

export default function LegacyNewProfessionalRedirectPage() {
  redirect('/professional-profiles/new');
}
