'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import OrderStatusBadge from '@/components/OrderStatusBadge';
import PaymentStatus from '@/components/PaymentStatus';
import { useTechnicianOrders } from '@/hooks/useTechnicianOrders';
import { useSupabase } from '@/hooks/useSupabase';
import { formatDateTime, formatVND, localizedName } from '@/lib/format';
import type { ServiceCategory, ServiceOrder } from '@/types/supabase';

export default function TechnicianHomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  const router = useRouter();
  const supabase = useSupabase();
  const { pendingOrders, myOrders, loading, error, acceptOrder, rejectOrder } = useTechnicianOrders();

  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [acting, setActing] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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

  const categoryLabel = (id: string) => {
    const c = categories.find((x) => x.id === id);
    return c ? `${c.icon} ${localizedName(c, locale)}` : id;
  };

  const handleAccept = async (orderId: string) => {
    if (acting) return;
    setActing(orderId);
    setActionError(null);
    try {
      await acceptOrder(orderId);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setActing(null);
    }
  };

  const OrderCard = ({ order, children }: { order: ServiceOrder; children?: React.ReactNode }) => (
    <article className="rounded-2xl border p-4" style={{ background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #ebebed)' }}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>
          {categoryLabel(order.category_id)}
        </span>
        <OrderStatusBadge status={order.status} locale={locale} />
      </div>
      {order.status === 'pending' && order.order_type === 'quote_request' && (
        <p className="mt-1 text-[11px] font-bold" style={{ color: 'var(--color-navy, #1A237E)' }}>
          🧾 {t('견적 요청 — 견적을 제출해 주세요', 'Yêu cầu báo giá — hãy gửi báo giá', 'Quote request — submit a quote')}
        </p>
      )}
      <p className="mt-1.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        🕒 {formatDateTime(order.scheduled_at, locale)}
      </p>
      <p className="mt-0.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        📍 {order.address}
      </p>
      {order.product_name && order.quantity !== null && order.unit_price !== null && (
        <p className="mt-2 inline-block rounded-lg px-2.5 py-1 text-xs font-extrabold" style={{ background: 'var(--color-primary-bg, #FFEBEE)', color: 'var(--color-primary)' }}>
          🛍️ {order.product_name} · {order.quantity}{order.unit_label} × {formatVND(order.unit_price)} = {formatVND(order.quantity * order.unit_price)}
        </p>
      )}
      {order.offered_price !== null && (
        <p className="mt-2 inline-block rounded-lg px-2.5 py-1 text-xs font-extrabold" style={{ background: 'var(--color-primary-bg, #FFEBEE)', color: 'var(--color-primary)' }}>
          💰 {t('고객 제시가', 'Giá khách đề xuất', 'Customer offer')} {formatVND(order.offered_price)}
        </p>
      )}
      {order.note && (
        <p className="mt-2 text-xs whitespace-pre-line leading-relaxed" style={{ color: 'var(--color-text-2, #5c5c6e)' }}>
          {order.note}
        </p>
      )}
      {order.status !== 'cancelled' && (
        <div className="mt-3">
          <PaymentStatus
            orderId={order.id}
            locale={locale}
            audience="technician"
            showUnpaid={order.technician_uid !== null && order.status !== 'completed'}
          />
        </div>
      )}
      {children}
    </article>
  );

  if (loading) {
    return <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{t('불러오는 중…', 'Đang tải…', 'Loading…')}</p>;
  }

  return (
    <div className="space-y-6">
      <div
        className="rounded-2xl border px-4 py-3"
        style={{ background: '#E8F5E9', borderColor: '#2E7D32' }}
      >
        <p className="text-xs font-extrabold" style={{ color: '#1B5E20' }}>
          🛡️ {t('플랫폼 안전 정산 보장 안내', 'Đảm bảo quyết toán an toàn qua nền tảng', 'Platform Safe Payout Guarantee')}
        </p>
        <p className="mt-1 text-[11px] leading-relaxed" style={{ color: '#1B5E20' }}>
          {t(
            '고객이 베스트마리오 플랫폼 계좌로 입금하고 관리자가 확인한 주문에는 「🛡️ 플랫폼 입금 확인 완료 (정산 보장)」 표시가 나타납니다. 입금 확인된 작업은 완료 시 수수료를 제외한 금액이 100% 정산되니 안심하고 일하세요.',
            'Đơn hàng đã được khách chuyển khoản vào nền tảng BestMario và quản trị viên xác nhận sẽ có nhãn «🛡️ Đã xác nhận tiền vào nền tảng (Đảm bảo quyết toán)». Khi hoàn thành, tiền quyết toán (sau khi trừ phí) được đảm bảo 100%.',
            'Orders where the customer has paid the BestMario platform and an admin confirmed the deposit display “🛡️ Platform deposit confirmed (Payout guaranteed)”. Your payout (minus fee) is 100% guaranteed upon completion.',
          )}
        </p>
      </div>

      {error && <p className="text-sm font-semibold" style={{ color: '#D32F2F' }}>{error}</p>}
      {actionError && <p className="text-sm font-semibold" style={{ color: '#D32F2F' }}>{actionError}</p>}

      {/* 대기 주문 */}
      <section>
        <h2 className="text-sm font-extrabold mb-2" style={{ color: 'var(--color-text)' }}>
          {t('대기 주문', 'Đơn chờ nhận', 'Available orders')} ({pendingOrders.length})
        </h2>

        {pendingOrders.length === 0 ? (
          <div className="rounded-2xl border p-6 text-center" style={{ background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #ebebed)' }}>
            <div className="text-3xl mb-2">☕</div>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
              {t(
                '지금은 수락할 수 있는 주문이 없습니다. 프로필의 기술 분야를 늘리면 더 많은 주문을 받을 수 있습니다.',
                'Hiện chưa có đơn nào. Thêm lĩnh vực trong hồ sơ để nhận nhiều đơn hơn.',
                'No available orders right now. Add more skills in your profile to receive more.'
              )}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {pendingOrders.map((o) => (
              <OrderCard key={o.id} order={o}>
                <div className="mt-3 flex gap-2">
                  {o.order_type === 'quote_request' ? (
                    <button
                      onClick={() => router.push(`/${locale}/technician/quotes`)}
                      className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white"
                      style={{ background: 'var(--color-navy, #1A237E)' }}
                    >
                      {t('견적 제출', 'Gửi báo giá', 'Submit quote')}
                    </button>
                  ) : (
                  <button
                    onClick={() => handleAccept(o.id)}
                    disabled={acting !== null}
                    className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-50"
                    style={{ background: 'var(--color-primary)' }}
                  >
                    {acting === o.id ? t('처리 중…', 'Đang xử lý…', 'Processing…') : t('수락', 'Nhận đơn', 'Accept')}
                  </button>
                  )}
                  <button
                    onClick={() => void rejectOrder(o.id)}
                    className="flex-1 rounded-xl border py-2.5 text-sm font-bold"
                    style={{ borderColor: 'var(--color-border, #ebebed)', color: 'var(--color-text-muted)' }}
                  >
                    {t('거절', 'Từ chối', 'Decline')}
                  </button>
                </div>
              </OrderCard>
            ))}
          </div>
        )}
      </section>

      {/* 내 주문 */}
      <section>
        <h2 className="text-sm font-extrabold mb-2" style={{ color: 'var(--color-text)' }}>
          {t('내 작업', 'Công việc của tôi', 'My jobs')} ({myOrders.length})
        </h2>

        {myOrders.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {t('진행 중인 작업이 없습니다.', 'Chưa có công việc nào.', 'No jobs yet.')}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {myOrders.map((o) => (
              <OrderCard key={o.id} order={o}>
                <button
                  onClick={() => router.push(`/${locale}/technician/order/${o.id}`)}
                  className="mt-3 w-full rounded-xl border py-2.5 text-sm font-bold"
                  style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}
                >
                  {t('작업 진행 →', 'Tiến hành →', 'Open job →')}
                </button>
              </OrderCard>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
