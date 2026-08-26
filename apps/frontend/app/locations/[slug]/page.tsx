import { redirect } from 'next/navigation';

export default async function ProvincePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/search?cityCode=${encodeURIComponent(slug)}`);
}
