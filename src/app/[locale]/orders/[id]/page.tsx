'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import OrderStatusBadge from '@/components/OrderStatusBadge';
import QuoteList from '@/components/QuoteList';
import { callReleaseEscrow } from '@/lib/firebase';
import { useSupabase } from '@/hooks/useSupabase';
import { useAuthState } from '@/hooks/useAuthState';
import PushBanner from '@/components/PushBanner';
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
  const [expected, setExpected] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

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

    const [cat, tech, pays, war, exp] = await Promise.all([
      supabase.from('service_categories').select('*').eq('id', o.category_id).maybeSingle(),
      o.technician_uid
        ? supabase.from('technician_public').select('*').eq('uid', o.technician_uid).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from('payments').select('*').eq('order_id', id),
      supabase.from('warranties').select('*').eq('order_id', id).maybeSingle(),
      // 결제해야 할 금액은 DB 의 단일 기준(order_expected_amount)에서 읽는다
      supabase.rpc('order_expected_amount', { p_order_id: id }),
    ]);

    setCategory((cat.data ?? null) as ServiceCategory | null);
    setTechnician((tech.data ?? null) as TechnicianPublic | null);
    setPayments((pays.data ?? []) as Payment[]);
    setWarranty((war.data ?? null) as Warranty | null);
    setExpected(Number(exp.data ?? 0));
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
      // DB 전이를 먼저 한다. 반대 순서로 하면 releaseEscrow 성공 후 UPDATE 가
      // 0건이 될 때 돈은 풀렸는데 주문은 in_progress 로 남고, 재시도하면
      // 이미 해제된 에스크로에 releaseEscrow 를 다시 호출하게 된다.
      // 조건부 UPDATE 가 0건이면 두 번째 승인이므로 여기서 멈춘다.
      const { data: updated, error: err } = await supabase
        .from('service_orders')
        .update({ status: 'completed' })
        .eq('id', order.id)
        .eq('status', 'in_progress')
        .select('id');

      if (err) throw new Error(err.message);

      if (!updated || updated.length === 0) {
        setApproveError(
          t('이미 처리된 주문입니다.', 'Đơn hàng đã được xử lý.', 'This order has already been processed.')
        );
        await load();
        return;
      }

      // 전이가 성공했으면 generate_settlement() 가 BM 결제를 확정하고
      // settlements · warranty 를 만든 상태다. 이제 Firebase 에스크로를 푼다.
      // BM 결제가 없는 주문(현금·이체)은 Firebase 에 보관된 금액이 없다.
      if (hasBmPayment) {
        try {
          await callReleaseEscrow(order.id);
        } catch (e) {
          setApproveError(
            t(
              `완료 처리는 되었지만 BM 에스크로 해제에 실패했습니다. 주문번호 ${order.id} 로 고객센터에 문의해 주세요. (${e instanceof Error ? e.message : String(e)})`,
              `Đơn đã hoàn thành nhưng giải ngân BM thất bại. Vui lòng liên hệ CSKH kèm mã đơn ${order.id}.`,
              `The order was completed but releasing the BM escrow failed. Contact support with order ${order.id}.`
            )
          );
        }
      }

      await load();
    } catch (e) {
      setApproveError(e instanceof Error ? e.message : String(e));
    } finally {
      setApproving(false);
    }
  };

  const handleCancel = async () => {
    if (cancelling || !order) return;
    setCancelling(true);
    setApproveError(null);
    try {
      const { error: err } = await supabase
        .from('service_orders')
        .update({ status: 'cancelled' })
        .eq('id', order.id)
        .in('status', ['pending', 'assigned']);
      if (err) throw new Error(err.message);
      await load();
    } catch (e) {
      setApproveError(e instanceof Error ? e.message : String(e));
    } finally {
      setCancelling(false);
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
      {order.status === 'pending' && <PushBanner locale={locale} audience="customer" />}

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

      {/* 결제가 필요한 상태 — 금액은 DB 기준(expected)과 접수 합계를 비교한다 */}
      {order.status !== 'cancelled' && order.status !== 'completed' && expected > 0 && totalPaid < expected && (
        <button
          onClick={() => router.push(`/${locale}/payment/${order.id}`)}
          className="w-full rounded-2xl py-3.5 text-sm font-extrabold text-white mb-4"
          style={{ background: 'var(--color-primary)' }}
        >
          {totalPaid > 0
            ? `${t('잔액 결제하기', 'Thanh toán phần còn lại', 'Pay the remainder')} ${formatVND(expected - totalPaid)} →`
            : t('결제하기 →', 'Thanh toán →', 'Pay now →')}
        </button>
      )}

      {/* 취소 — 기술자 작업 시작 전까지만 */}
      {(order.status === 'pending' || order.status === 'assigned') && (
        <button
          onClick={() => void handleCancel()}
          disabled={cancelling}
          className="w-full rounded-2xl border py-3 text-xs font-bold mb-4 disabled:opacity-50"
          style={{ borderColor: 'var(--color-border, #ebebed)', color: '#D32F2F' }}
        >
          {cancelling ? t('처리 중…', 'Đang xử lý…', 'Processing…') : t('주문 취소', 'Hủy đơn hàng', 'Cancel order')}
        </button>
      )}

      {/* 작업 중이지만 아직 완료 요청(사진 등록)이 오지 않은 상태 */}
      {order.status === 'in_progress' && order.photos_after.length === 0 && (
        <section className="rounded-2xl border p-5" style={{ background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #ebebed)' }}>
          <h2 className="text-sm font-extrabold mb-1" style={{ color: 'var(--color-text)' }}>
            {t('작업 진행 중', 'Đang thực hiện', 'Work in progress')}
          </h2>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            {t(
              '기술자가 작업을 진행하고 있습니다. 작업 후 사진이 등록되면 완료 승인 버튼이 표시됩니다.',
              'Kỹ thuật viên đang làm việc. Nút xác nhận sẽ xuất hiện khi ảnh hoàn thành được tải lên.',
              'The technician is working. The approval button appears once the after-work photos are uploaded.'
            )}
          </p>
        </section>
      )}

      {/* 완료 승인 (스펙 §5 공통 완료 처리) — 작업 후 사진이 등록된 뒤에만 */}
      {order.status === 'in_progress' && order.photos_after.length > 0 && (
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

          {/* Review Focus #4 — 자동 승인은 Phase 2(Edge Function)에서 구현된다.
              현재는 관리자가 수동으로 처리하므로 "자동" 이라고 쓰지 않는다. */}
          <p className="mt-2 text-[11px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            {t(
              '완료 요청 후 72시간 내에 승인해 주세요. 미응답 시 관리자가 확인 후 완료 처리합니다. 작업에 문제가 있으면 승인 전에 고객센터로 문의해 주세요.',
              'Hãy xác nhận trong 72 giờ. Nếu không phản hồi, quản trị viên sẽ kiểm tra và hoàn tất. Nếu có vấn đề, hãy liên hệ CSKH trước khi xác nhận.',
              'Please approve within 72 hours. If you do not respond, an admin reviews and completes the order. If something is wrong, contact support before approving.'
            )}
          </p>
        </section>
      )}
    </Shell>
  );
}
