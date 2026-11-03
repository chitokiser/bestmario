'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import OrderStatusBadge from '@/components/OrderStatusBadge';
import QuoteList from '@/components/QuoteList';
import { callReleaseEscrow } from '@/lib/firebase';
import { useSupabase } from '@/hooks/useSupabase';
import { useAuthState } from '@/hooks/useAuthState';
import { formatDateTime, formatVND, localizedName } from '@/lib/format';
import type { Payment, ServiceCategory, ServiceOrder, Warranty } from '@/types/supabase';
import type { TechnicianPublic } from '@/hooks/useQuotations';

// 컴포넌트 함수 밖에 둔다 — 안에서 정의하면 매 렌더마다 새 타입이 되어 서브트리가 remount 된다
function Shell({
  locale,
  onBack,
  children,
}: {
  locale: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen px-4 py-6" style={{ background: 'var(--color-bg)' }}>
      <div className="mx-auto w-full max-w-lg">
        <button onClick={onBack} className="mb-4 text-xs font-semibold" style={{ color: 'var(--color-text-muted)' }}>
          ← {locale === 'vi' ? 'Đơn hàng' : locale === 'en' ? 'Orders' : '주문 내역'}
        </button>
        {children}
      </div>
    </main>
  );
}

export default function OrderDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = use(params);
  const router = useRouter();
  const supabase = useSupabase();
  const { user, authLoading } = useAuthState();

  const [order, setOrder] = useState<ServiceOrder | null>(null);
  const [category, setCategory] = useState<ServiceCategory | null>(null);
  const [technician, setTechnician] = useState<TechnicianPublic | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [warranty, setWarranty] = useState<Warranty | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  const t = useCallback(
    (ko: string, vi: string, en: string) => (locale === 'vi' ? vi : locale === 'en' ? en : ko),
    [locale]
  );

  const load = useCallback(async () => {
    setLoading(true);

    const { data: row, error: err } = await supabase
      .from('service_orders')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (err || !row) {
      setLoadError(err?.message ?? t('주문을 찾을 수 없습니다.', 'Không tìm thấy đơn hàng.', 'Order not found.'));
      setLoading(false);
      return;
    }

    const o = row as ServiceOrder;
    setOrder(o);
    setLoadError(null);

    const [cat, tech, pays, war] = await Promise.all([
      supabase.from('service_categories').select('*').eq('id', o.category_id).maybeSingle(),
      o.technician_uid
        ? supabase.from('technician_public').select('*').eq('uid', o.technician_uid).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from('payments').select('*').eq('order_id', id),
      supabase.from('warranties').select('*').eq('order_id', id).maybeSingle(),
    ]);

    setCategory((cat.data ?? null) as ServiceCategory | null);
    setTechnician((tech.data ?? null) as TechnicianPublic | null);
    setPayments((pays.data ?? []) as Payment[]);
    setWarranty((war.data ?? null) as Warranty | null);
    setLoading(false);
  }, [supabase, id, t]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    void load();
  }, [authLoading, user, load]);

  const totalPaid = payments
    .filter((p) => p.status !== 'refunded')
    .reduce((sum, p) => sum + p.amount, 0);

  const hasBmPayment = payments.some((p) => p.method === 'bm' && p.status !== 'refunded');

  const handleApprove = async () => {
    if (approving || !order) return;
    setApproving(true);
    setApproveError(null);

    try {
      // BM 에스크로가 있는 주문만 Firebase 해제를 호출한다.
      // 현금·이체 결제는 Firebase 에 보관된 금액이 없으므로 호출 대상이 아니다.
      if (hasBmPayment) {
        await callReleaseEscrow(order.id);
      }

      // 상태 전이가 generate_settlement() 트리거를 깨워
      // payments held→completed, settlements, warranty 를 만든다.
      const { error: err } = await supabase
        .from('service_orders')
        .update({ status: 'completed' })
        .eq('id', order.id)
        .eq('status', 'in_progress');

      if (err) throw new Error(err.message);

      await load();
    } catch (e) {
      setApproveError(e instanceof Error ? e.message : String(e));
    } finally {
      setApproving(false);
    }
  };

  const back = () => router.push(`/${locale}/orders`);

  if (!authLoading && !user) {
    return <Shell locale={locale} onBack={back}><p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{t('로그인이 필요합니다.', 'Cần đăng nhập.', 'Login required.')}</p></Shell>;
  }
  if (loading) {
    return <Shell locale={locale} onBack={back}><p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{t('불러오는 중…', 'Đang tải…', 'Loading…')}</p></Shell>;
  }
  if (loadError || !order) {
    return <Shell locale={locale} onBack={back}><p className="text-sm font-semibold" style={{ color: '#D32F2F' }}>{loadError}</p></Shell>;
  }

  return (
    <Shell locale={locale} onBack={back}>
      {/* 헤더 */}
      <div className="rounded-2xl border p-5 mb-4" style={{ background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #ebebed)' }}>
        <div className="flex items-start justify-between gap-2 mb-3">
          <h1 className="text-lg font-extrabold" style={{ color: 'var(--color-text)' }}>
            {category ? `${category.icon} ${localizedName(category, locale)}` : order.category_id}
          </h1>
          <OrderStatusBadge status={order.status} locale={locale} />
        </div>

        <dl className="space-y-2 text-xs">
          {[
            [t('방문 일시', 'Thời gian', 'Scheduled'), formatDateTime(order.scheduled_at, locale)],
            [t('주소', 'Địa chỉ', 'Address'), order.address],
            [t('기술자', 'Kỹ thuật viên', 'Technician'),
              technician
                ? `${technician.name} · ⭐ ${technician.rating.toFixed(1)} (${technician.rating_count})`
                : t('아직 배정되지 않았습니다', 'Chưa phân công', 'Not assigned yet')],
            ...(totalPaid > 0 ? [[t('결제 금액', 'Số tiền', 'Paid'), formatVND(totalPaid)]] : []),
            ...(warranty ? [[t('A/S 만료', 'Bảo hành đến', 'Warranty until'), formatDateTime(warranty.expires_at, locale)]] : []),
          ].map(([label, value]) => (
            <div key={label} className="flex gap-3">
              <dt className="w-24 flex-shrink-0 font-semibold" style={{ color: 'var(--color-text-muted)' }}>{label}</dt>
              <dd style={{ color: 'var(--color-text)' }}>{value}</dd>
            </div>
          ))}
        </dl>

        {order.note && (
          <p className="mt-3 pt-3 border-t text-xs whitespace-pre-line leading-relaxed" style={{ borderColor: 'var(--color-border, #ebebed)', color: 'var(--color-text-2, #5c5c6e)' }}>
            {order.note}
          </p>
        )}
      </div>

      {/* 견적 목록 (quote_request) */}
      {order.order_type === 'quote_request' && (
        <section className="mb-4">
          <h2 className="text-sm font-extrabold mb-2" style={{ color: 'var(--color-text)' }}>
            {t('접수된 견적', 'Báo giá đã nhận', 'Received quotes')}
          </h2>
          <QuoteList
            orderId={order.id}
            locale={locale}
            selectable={order.status === 'pending'}
            onAccept={() => router.push(`/${locale}/payment/${order.id}`)}
          />
        </section>
      )}

      {/* 결제가 필요한 상태 */}
      {order.status !== 'cancelled' && totalPaid === 0 && (order.order_type === 'fixed' || order.status === 'assigned') && (
        <button
          onClick={() => router.push(`/${locale}/payment/${order.id}`)}
          className="w-full rounded-2xl py-3.5 text-sm font-extrabold text-white mb-4"
          style={{ background: 'var(--color-primary)' }}
        >
          {t('결제하기 →', 'Thanh toán →', 'Pay now →')}
        </button>
      )}

      {/* 완료 승인 (스펙 §5 공통 완료 처리) */}
      {order.status === 'in_progress' && (
        <section className="rounded-2xl border p-5" style={{ background: 'var(--color-surface, #fff)', borderColor: 'var(--color-primary)' }}>
          <h2 className="text-sm font-extrabold mb-1" style={{ color: 'var(--color-text)' }}>
            {t('작업 완료 승인', 'Xác nhận hoàn thành', 'Approve completion')}
          </h2>
          <p className="text-xs mb-3 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            {t(
              '기술자가 완료를 요청했습니다. 작업 사진을 확인한 뒤 승인해 주세요.',
              'Kỹ thuật viên đã yêu cầu xác nhận. Hãy kiểm tra ảnh rồi phê duyệt.',
              'The technician requested completion. Review the photos, then approve.'
            )}
          </p>

          {order.photos_after.length > 0 ? (
            <div className="grid grid-cols-3 gap-2 mb-3">
              {order.photos_after.map((url) => (
                <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                  <img
                    src={url}
                    alt={t('작업 후 사진', 'Ảnh sau khi làm', 'Photo after work')}
                    loading="lazy"
                    decoding="async"
                    className="w-full aspect-square object-cover rounded-lg bg-gray-100"
                  />
                </a>
              ))}
            </div>
          ) : (
            <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
              {t('등록된 작업 사진이 없습니다.', 'Chưa có ảnh công việc.', 'No work photos uploaded.')}
            </p>
          )}

          {approveError && (
            <p className="text-xs font-semibold mb-2" style={{ color: '#D32F2F' }}>{approveError}</p>
          )}

          <button
            onClick={handleApprove}
            disabled={approving}
            className="w-full rounded-xl py-3 text-sm font-extrabold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: 'var(--color-primary)' }}
          >
            {approving
              ? t('처리 중…', 'Đang xử lý…', 'Processing…')
              : t('완료 승인하고 결제 확정', 'Xác nhận & giải ngân', 'Approve & release payment')}
          </button>

          {/* Review Focus #4 — 72시간 자동 승인 안내 (Phase 1 은 관리자 수동 처리) */}
          <p className="mt-2 text-[11px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            {t(
              '72시간 내 미승인 시 자동으로 완료 처리됩니다. 작업에 문제가 있으면 승인 전에 고객센터로 문의해 주세요.',
              'Nếu không xác nhận trong 72 giờ, đơn sẽ tự động hoàn thành. Nếu có vấn đề, hãy liên hệ CSKH trước khi xác nhận.',
              'If you do not approve within 72 hours, the order completes automatically. If something is wrong, contact support before approving.'
            )}
          </p>
        </section>
      )}
    </Shell>
  );
}
