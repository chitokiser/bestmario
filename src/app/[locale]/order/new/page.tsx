'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import OrderForm from '@/components/OrderForm';
import { useSupabase } from '@/hooks/useSupabase';
import { useAuthState } from '@/hooks/useAuthState';
import type { ServiceCategory, ServiceOrder, ServiceProduct } from '@/types/supabase';

export default function NewOrderPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  const router = useRouter();
  const supabase = useSupabase();
  const { user, authLoading } = useAuthState();

  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [products, setProducts] = useState<ServiceProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [cats, prods] = await Promise.all([
        supabase.from('service_categories').select('*').order('id'),
        supabase.from('service_products').select('*').order('base_price'),
      ]);
      if (cancelled) return;

      if (cats.error || prods.error) {
        setLoadError(cats.error?.message ?? prods.error?.message ?? '불러오기 실패');
      } else {
        setLoadError(null);
        setCategories((cats.data ?? []) as ServiceCategory[]);
        setProducts((prods.data ?? []) as ServiceProduct[]);
      }
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [supabase]);

  const handleSuccess = (order: ServiceOrder) => {
    router.push(`/${locale}/payment/${order.id}`);
  };

  const t = (ko: string, vi: string, en: string) =>
    locale === 'vi' ? vi : locale === 'en' ? en : ko;

  return (
    <main className="min-h-screen px-4 py-6" style={{ background: 'var(--color-bg)' }}>
      <div className="mx-auto w-full max-w-lg">
        <h1 className="text-xl font-extrabold mb-1" style={{ color: 'var(--color-text)' }}>
          {t('서비스 신청', 'Đặt dịch vụ', 'Request Service')}
        </h1>
        <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>
          {t('고정가 항목을 선택해 바로 예약하세요.', 'Chọn hạng mục giá cố định và đặt ngay.', 'Pick a fixed-price item and book instantly.')}
        </p>

        {!authLoading && !user ? (
          <div className="rounded-2xl border p-6 text-center" style={{ background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #ebebed)' }}>
            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--color-text)' }}>
              {t('로그인이 필요합니다', 'Cần đăng nhập', 'Login required')}
            </p>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {t('홈에서 로그인 후 다시 시도해 주세요.', 'Hãy đăng nhập ở trang chủ rồi thử lại.', 'Please log in from the home page and try again.')}
            </p>
            <button
              onClick={() => router.push(`/${locale}`)}
              className="mt-4 rounded-xl px-5 py-2.5 text-sm font-bold text-white"
              style={{ background: 'var(--color-primary)' }}
            >
              {t('홈으로', 'Về trang chủ', 'Go home')}
            </button>
          </div>
        ) : loading ? (
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {t('불러오는 중…', 'Đang tải…', 'Loading…')}
          </p>
        ) : loadError ? (
          <p className="text-sm font-semibold" style={{ color: '#D32F2F' }}>{loadError}</p>
        ) : (
          <OrderForm
            categories={categories}
            products={products}
            locale={locale}
            onSuccess={handleSuccess}
          />
        )}
      </div>
    </main>
  );
}
