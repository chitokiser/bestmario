'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PaymentSheet from '@/components/PaymentSheet';
import { useSupabase } from '@/hooks/useSupabase';
import { useAuthState } from '@/hooks/useAuthState';
import { formatVND } from '@/lib/format';
import type { Payment, ServiceOrder } from '@/types/supabase';

export default function PaymentPage({
  params,
}: {
  params: Promise<{ locale: string; orderId: string }>;
}) {
  const { locale, orderId } = use(params);
  const router = useRouter();
  const supabase = useSupabase();
  const { user, authLoading } = useAuthState();

  const [order, setOrder] = useState<ServiceOrder | null>(null);
  const [amount, setAmount] = useState(0);
  const [paid, setPaid] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const t = useCallback(
    (ko: string, vi: string, en: string) => (locale === 'vi' ? vi : locale === 'en' ? en : ko),
    [locale]
  );

  const load = useCallback(async () => {
    setLoading(true);

    const { data: orderRow, error: orderErr } = await supabase
      .from('service_orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();

    if (orderErr || !orderRow) {
      setLoadError(orderErr?.message ?? t('주문을 찾을 수 없습니다.', 'Không tìm thấy đơn hàng.', 'Order not found.'));
      setLoading(false);
      return;
    }

    const o = orderRow as ServiceOrder;
    setOrder(o);

    // 금액은 DB 에서만 읽는다 (스펙 §10 클라이언트 금액 직접 수신 금지).
    // 선택된 견적가 > 고정가 상품가 순서 — 003_functions.sql 의 order_expected_amount 와 동일한 규칙.
    let expected = 0;

    const { data: acceptedQuote } = await supabase
      .from('quotations')
      .select('price')
      .eq('order_id', orderId)
      .eq('status', 'accepted')
      .maybeSingle();

    if (acceptedQuote?.price) {
      expected = Number(acceptedQuote.price);
    } else if (o.product_id) {
      const { data: product } = await supabase
        .from('service_products')
        .select('base_price')
        .eq('id', o.product_id)
        .maybeSingle();
      if (product?.base_price) expected = Number(product.base_price);
    }

    const { data: payments } = await supabase
      .from('payments')
      .select('amount, status')
      .eq('order_id', orderId);

    const alreadyPaid = ((payments ?? []) as Pick<Payment, 'amount' | 'status'>[])
      .filter((p) => p.status === 'held' || p.status === 'completed')
      .reduce((sum, p) => sum + p.amount, 0);

    setAmount(expected);
    setPaid(alreadyPaid);
    setLoadError(null);
    setLoading(false);
  }, [supabase, orderId, t]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    void load();
  }, [authLoading, user, load]);

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <main className="min-h-screen px-4 py-6" style={{ background: 'var(--color-bg)' }}>
      <div className="mx-auto w-full max-w-lg">
        <h1 className="text-xl font-extrabold mb-6" style={{ color: 'var(--color-text)' }}>
          {t('결제', 'Thanh toán', 'Payment')}
        </h1>
        {children}
      </div>
    </main>
  );

  if (!authLoading && !user) {
    return (
      <Shell>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {t('로그인이 필요합니다.', 'Cần đăng nhập.', 'Login required.')}
        </p>
      </Shell>
    );
  }

  if (loading) {
    return (
      <Shell>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {t('불러오는 중…', 'Đang tải…', 'Loading…')}
        </p>
      </Shell>
    );
  }

  if (loadError || !order) {
    return (
      <Shell>
        <p className="text-sm font-semibold" style={{ color: '#D32F2F' }}>{loadError}</p>
      </Shell>
    );
  }

  // 이미 결제 완료된 주문
  if (amount > 0 && paid >= amount) {
    return (
      <Shell>
        <div className="rounded-2xl border p-6 text-center" style={{ background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #ebebed)' }}>
          <div className="text-3xl mb-2">✅</div>
          <p className="text-sm font-bold mb-1" style={{ color: 'var(--color-text)' }}>
            {t('이미 결제된 주문입니다', 'Đơn hàng đã được thanh toán', 'This order is already paid')}
          </p>
          <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
            {t('결제 금액', 'Số tiền', 'Amount')} {formatVND(paid)}
          </p>
          <button
            onClick={() => router.push(`/${locale}/orders/${orderId}`)}
            className="rounded-xl px-5 py-2.5 text-sm font-bold text-white"
            style={{ background: 'var(--color-primary)' }}
          >
            {t('주문 상세로', 'Xem đơn hàng', 'View order')}
          </button>
        </div>
      </Shell>
    );
  }

  // quote_request 인데 아직 견적을 선택하지 않은 주문 — 결제할 금액이 없다
  if (amount <= 0) {
    return (
      <Shell>
        <div className="rounded-2xl border p-6 text-center" style={{ background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #ebebed)' }}>
          <div className="text-3xl mb-2">🧾</div>
          <p className="text-sm font-bold mb-1" style={{ color: 'var(--color-text)' }}>
            {t('아직 결제 금액이 확정되지 않았습니다', 'Số tiền chưa được xác định', 'The amount is not set yet')}
          </p>
          <p className="text-xs mb-4 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            {t(
              '견적 요청 주문은 기술자 견적을 선택한 뒤에 결제합니다.',
              'Với đơn yêu cầu báo giá, bạn thanh toán sau khi chọn báo giá.',
              'For a quote request, you pay after choosing a technician quote.'
            )}
          </p>
          <button
            onClick={() => router.push(`/${locale}/orders/${orderId}`)}
            className="rounded-xl px-5 py-2.5 text-sm font-bold text-white"
            style={{ background: 'var(--color-primary)' }}
          >
            {t('견적 보기', 'Xem báo giá', 'View quotes')}
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <PaymentSheet
        orderId={orderId}
        amount={amount - paid}
        locale={locale}
        onSuccess={() => router.push(`/${locale}/orders/${orderId}`)}
      />
    </Shell>
  );
}
