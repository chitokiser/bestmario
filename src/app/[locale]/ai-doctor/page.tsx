'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import AiDoctor from '@/components/AiDoctor';

export default function AiDoctorPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = use(params);
  const router = useRouter();

  const t = (ko: string, vi: string, en: string) =>
    locale === 'vi' ? vi : locale === 'en' ? en : ko;

  return (
    <main className="min-h-screen px-4 py-6" style={{ background: 'var(--color-bg)' }}>
      <div className="mx-auto w-full max-w-lg space-y-4">
        {/* 뒤로가기 버튼 */}
        <button
          onClick={() => router.back()}
          className="text-xs font-semibold flex items-center gap-1"
          style={{ color: 'var(--color-text-muted)' }}
        >
          ← {t('뒤로가기', 'Quay lại', 'Back')}
        </button>

        {/* 헤더 배너 */}
        <div
          className="rounded-3xl p-6 text-white text-center relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #1A237E 0%, #283593 60%, #C62828 100%)' }}
        >
          <div className="text-4xl mb-2">🩺</div>
          <h1 className="text-xl font-black">
            {t('베스트마리오 AI 홈닥터', 'Bác sĩ sự cố nhà ở AI', 'BestMario AI Home Doctor')}
          </h1>
          <p className="text-xs text-white/80 mt-1.5 leading-relaxed">
            {t(
              '사진 1장으로 고장 원인 분석부터 하노이 시세 견적까지 3초 만에 확인하세요.',
              'Chỉ 1 bức ảnh, chẩn đoán nguyên nhân và báo giá theo thị trường Hà Nội trong 3 giây.',
              'Analyze defects and get Hanoi market estimates in 3 seconds with just 1 photo.'
            )}
          </p>
        </div>

        {/* AI 진단기 본체 */}
        <AiDoctor locale={locale} />
      </div>
    </main>
  );
}
