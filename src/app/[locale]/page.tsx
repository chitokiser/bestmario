import { Suspense } from 'react';
import LandingClient from '@/components/LandingClient';

interface Props {
  params: Promise<{ locale: string }>;
}

export default async function HomePage({ params }: Props) {
  const { locale } = await params;

  return (
    <Suspense fallback={<div className="min-h-screen" style={{ background: '#E53935' }} />}>
      <LandingClient locale={locale} />
    </Suspense>
  );
}
