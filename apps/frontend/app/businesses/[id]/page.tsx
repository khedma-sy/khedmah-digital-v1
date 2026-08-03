import { redirect } from 'next/navigation';

export default async function LegacyBusinessProfileRedirectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/business-profiles/${id}`);
}
