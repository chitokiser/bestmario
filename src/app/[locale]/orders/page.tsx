'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import OrderStatusBadge from '@/components/OrderStatusBadge';
import { useOrders } from '@/hooks/useOrders';
import { useSupabase } from '@/hooks/useSupabase';
import { useAuthState } from '@/hooks/useAuthState';
import PushBanner from '@/components/PushBanner';
import { formatDateTime, formatVND, localizedName } from '@/lib/format';
import type { Payment, ServiceCategory } from '@/types/supabase';

const ORDER_TYPE_LABEL = {
  fixed:         { ko: '고정가',     vi: 'Giá cố định',  en: 'Fixed price' },
  customer_bid:  { ko: '가격 제시',  vi: 'Tự đề giá',    en: 'Customer bid' },
  quote_request: { ko: '견적 요청',  vi: 'Yêu cầu báo giá', en: 'Quote request' },
} as const;

export default function OrdersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  const router = useRouter();
  const supabase = useSupabase();
  const { user, authLoading } = useAuthState();
  const { orders, loading, error } = useOrders();

  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [paidByOrder, setPaidByOrder] = useState<Record<string, number>>({});

  const t = (ko: string, vi: string, en: string) =>
    locale === 'vi' ? vi : locale === 'en' ? en : ko;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('service_categories').select('*');
      if (!cancelled) setCategories((data ?? []) as ServiceCategory[]);
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  useEffect(() => {
    if (orders.length === 0) {
      setPaidByOrder({});
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('payments')
        .select('order_id, amount, status')
        .in('order_id', orders.map((o) => o.id));
      if (cancelled) return;

      const sums: Record<string, number> = {};
      for (const p of (data ?? []) as Pick<Payment, 'order_id' | 'amount' | 'status'>[]) {
        if (p.status === 'refunded') continue;
        sums[p.order_id] = (sums[p.order_id] ?? 0) + p.amount;
      }
      setPaidByOrder(sums);
    })();
    return () => { cancelled = true; };
  }, [supabase, orders]);

  const categoryOf = (id: string) => categories.find((c) => c.id === id);

  return (
    <main className="min-h-screen px-4 py-6" style={{ background: 'var(--color-bg)' }}>
      <div className="mx-auto w-full max-w-lg">
        <h1 className="text-xl font-extrabold mb-6" style={{ color: 'var(--color-text)' }}>
          {t('내 주문 내역', 'Đơn hàng của tôi', 'My Orders')}
        </h1>

        {user && <PushBanner locale={locale} audience="customer" />}

        {!authLoading && !user ? (
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {t('로그인이 필요합니다.', 'Cần đăng nhập.', 'Login required.')}
          </p>
        ) : loading ? (
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {t('불러오는 중…', 'Đang tải…', 'Loading…')}
          </p>
        ) : error ? (
          <p className="text-sm font-semibold" style={{ color: '#D32F2F' }}>{error}</p>
        ) : orders.length === 0 ? (
          <div className="rounded-2xl border p-8 text-center" style={{ background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #ebebed)' }}>
            <div className="text-4xl mb-3">🧰</div>
            <p className="text-sm font-bold mb-1" style={{ color: 'var(--color-text)' }}>
              {t('주문 내역이 없습니다', 'Chưa có đơn hàng', 'No orders yet')}
            </p>
            <button
              onClick={() => router.push(`/${locale}/order/new`)}
              className="mt-4 rounded-xl px-5 py-2.5 text-sm font-bold text-white"
              style={{ background: 'var(--color-primary)' }}
            >
              {t('서비스 신청하기', 'Đặt dịch vụ', 'Request service')}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {orders.map((o) => {
              const cat = categoryOf(o.category_id);
              const amount = paidByOrder[o.id] ?? 0;

              return (
                <button
                  key={o.id}
                  onClick={() => router.push(`/${locale}/orders/${o.id}`)}
                  className="w-full text-left rounded-2xl border p-4 transition-shadow hover:shadow-sm"
                  style={{ background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #ebebed)' }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>
                      {cat ? `${cat.icon} ${localizedName(cat, locale)}` : o.category_id}
                    </span>
                    <OrderStatusBadge status={o.status} locale={locale} />
                  </div>

                  <p className="mt-1.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {t(ORDER_TYPE_LABEL[o.order_type].ko, ORDER_TYPE_LABEL[o.order_type].vi, ORDER_TYPE_LABEL[o.order_type].en)}
                    {' · '}
                    {formatDateTime(o.scheduled_at, locale)}
                  </p>

                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="text-[11px] truncate pr-2" style={{ color: 'var(--color-text-muted)' }}>
                      {o.address}
                    </span>
                    {amount > 0 && (
                      <span className="text-sm font-extrabold whitespace-nowrap" style={{ color: 'var(--color-primary)' }}>
                        {formatVND(amount)}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
