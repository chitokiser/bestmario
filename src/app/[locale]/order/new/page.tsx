'use client';

import { use, useEffect, useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import OrderForm from '@/components/OrderForm';
import { useSupabase } from '@/hooks/useSupabase';
import { useAuthState } from '@/hooks/useAuthState';
import { useLogin } from '@/hooks/useLogin';
import type { ServiceCategory, ServiceOrder, ServiceProduct } from '@/types/supabase';

export default function NewOrderPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  const router = useRouter();
  const supabase = useSupabase();
  const { user, authLoading } = useAuthState();
  const { login, joinLoading } = useLogin(locale);

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
          <div className="rounded-3xl border p-8 text-center" style={{ background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #ebebed)' }}>
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-2xl">
              🔒
            </div>
            <p className="text-sm font-extrabold mb-1" style={{ color: 'var(--color-text)' }}>
              {t('회원 전용 서비스입니다', 'Dành riêng cho thành viên', 'Members-Only Service')}
            </p>
            <p className="text-xs max-w-xs mx-auto leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
              {t(
                '서비스 주문 및 견적 신청은 회원만 등록 가능합니다. 구글 계정으로 3초 만에 로그인 후 바로 진행해 보세요!',
                'Chỉ thành viên mới có thể đặt dịch vụ. Đăng nhập 3 giây bằng Google để tiếp tục!',
                'Only members can place service orders. Log in with Google in 3 seconds to proceed!'
              )}
            </p>
            <button
              onClick={login}
              disabled={joinLoading}
              className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-xs font-black text-white shadow-md transition-transform active:scale-95 disabled:opacity-50"
              style={{ background: 'var(--color-primary)' }}
            >
              <span>🔑</span>
              <span>
                {joinLoading
                  ? t('로그인 중…', 'Đang đăng nhập…', 'Logging in…')
                  : t('구글로 3초 로그인하기', 'Đăng nhập Google trong 3 giây', 'Log in with Google in 3s')}
              </span>
            </button>
          </div>
        ) : loading ? (
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {t('불러오는 중…', 'Đang tải…', 'Loading…')}
          </p>
        ) : loadError ? (
          <p className="text-sm font-semibold" style={{ color: '#D32F2F' }}>{loadError}</p>
        ) : (
          <Suspense fallback={<p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{t('불러오는 중…', 'Đang tải…', 'Loading…')}</p>}>
            <OrderForm
              categories={categories}
              products={products}
              locale={locale}
              onSuccess={handleSuccess}
            />
          </Suspense>
        )}
      </div>
    </main>
  );
}
