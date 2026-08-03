import { redirect } from 'next/navigation';

export default async function LegacyProfessionalRedirectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/professional-profiles/${id}`);
}
