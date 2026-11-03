'use client';

import { use, useCallback, useEffect, useState } from 'react';
import OrderStatusBadge from '@/components/OrderStatusBadge';
import { useSupabase } from '@/hooks/useSupabase';
import { formatDateTime, localizedName } from '@/lib/format';
import type { DbUser, OrderStatus, ServiceCategory, ServiceOrder, TechnicianProfile } from '@/types/supabase';

const STATUS_FILTERS: (OrderStatus | 'all')[] = [
  'all', 'pending', 'assigned', 'in_progress', 'completed', 'cancelled', 'disputed',
];

const STATUS_FILTER_LABEL: Record<string, { ko: string; vi: string; en: string }> = {
  all:         { ko: '전체',   vi: 'Tất cả',    en: 'All' },
  pending:     { ko: '대기',   vi: 'Chờ',       en: 'Pending' },
  assigned:    { ko: '배정',   vi: 'Đã phân',   en: 'Assigned' },
  in_progress: { ko: '진행',   vi: 'Đang làm',  en: 'In progress' },
  completed:   { ko: '완료',   vi: 'Xong',      en: 'Completed' },
  cancelled:   { ko: '취소',   vi: 'Đã hủy',    en: 'Cancelled' },
  disputed:    { ko: '분쟁',   vi: 'Tranh chấp', en: 'Disputed' },
};

export default function AdminOrdersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  const supabase = useSupabase();

  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [technicians, setTechnicians] = useState<TechnicianProfile[]>([]);
  const [users, setUsers] = useState<DbUser[]>([]);
  const [filter, setFilter] = useState<OrderStatus | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assignTo, setAssignTo] = useState<Record<string, string>>({});

  const t = (ko: string, vi: string, en: string) =>
    locale === 'vi' ? vi : locale === 'en' ? en : ko;

  const load = useCallback(async () => {
    setLoading(true);

    const [ords, cats, techs, us] = await Promise.all([
      supabase.from('service_orders').select('*').order('created_at', { ascending: false }),
      supabase.from('service_categories').select('*'),
      supabase.from('technician_profiles').select('*').eq('status', 'active'),
      supabase.from('users').select('*'),
    ]);

    const firstError = ords.error ?? cats.error ?? techs.error ?? us.error;
    setError(firstError ? firstError.message : null);

    setOrders((ords.data ?? []) as ServiceOrder[]);
    setCategories((cats.data ?? []) as ServiceCategory[]);
    setTechnicians((techs.data ?? []) as TechnicianProfile[]);
    setUsers((us.data ?? []) as DbUser[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const nameOf = (uid: string | null) =>
    uid ? (users.find((u) => u.uid === uid)?.name || uid.slice(0, 10)) : '';

  const categoryLabel = (id: string) => {
    const c = categories.find((x) => x.id === id);
    return c ? `${c.icon} ${localizedName(c, locale)}` : id;
  };

  const handleAssign = async (orderId: string) => {
    const uid = assignTo[orderId];
    if (!uid || acting) return;

    setActing(orderId);
    setError(null);
    try {
      const { error: err } = await supabase
        .from('service_orders')
        .update({ technician_uid: uid, status: 'assigned' })
        .eq('id', orderId);
      if (err) throw new Error(err.message);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActing(null);
    }
  };

  // 고객이 72시간 내 완료 승인을 하지 않은 주문의 수동 완료 (스펙 §5 공통 완료 처리).
  // Phase 1 에는 자동 승인 잡이 없으므로 이 버튼이 그 역할을 한다.
  // is_admin() 이므로 guard_order_transition 을 통과하고,
  // generate_settlement 트리거가 정산·워런티를 만든다.
  const handleForceComplete = async (orderId: string) => {
    if (acting) return;
    setActing(orderId);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('service_orders')
        .update({ status: 'completed' })
        .eq('id', orderId)
        .eq('status', 'in_progress')
        .select('id');
      if (err) throw new Error(err.message);
      if (!data || data.length === 0) {
        throw new Error(t('이미 처리된 주문입니다.', 'Đơn đã được xử lý.', 'Already processed.'));
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActing(null);
    }
  };

  const handleCancel = async (orderId: string) => {
    if (acting) return;
    setActing(orderId);
    setError(null);
    try {
      const { error: err } = await supabase
        .from('service_orders')
        .update({ status: 'cancelled' })
        .eq('id', orderId);
      if (err) throw new Error(err.message);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActing(null);
    }
  };

  const shown = filter === 'all' ? orders : orders.filter((o) => o.status === filter);

  // 해당 주문 카테고리를 다룰 수 있는 활성 기술자만 후보로 보여준다
  const candidatesFor = (categoryId: string) =>
    technicians.filter((p) => p.skills.includes(categoryId));

  if (loading) {
    return <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{t('불러오는 중…', 'Đang tải…', 'Loading…')}</p>;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-base font-extrabold" style={{ color: 'var(--color-text)' }}>
        {t('주문 관리', 'Quản lý đơn hàng', 'Orders')} ({shown.length}/{orders.length})
      </h1>

      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {STATUS_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="flex-shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold border"
            style={
              filter === f
                ? { background: 'var(--color-primary)', borderColor: 'var(--color-primary)', color: '#fff' }
                : { background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #ebebed)', color: 'var(--color-text-muted)' }
            }
          >
            {t(STATUS_FILTER_LABEL[f].ko, STATUS_FILTER_LABEL[f].vi, STATUS_FILTER_LABEL[f].en)}
          </button>
        ))}
      </div>

      {error && <p className="text-xs font-semibold" style={{ color: '#D32F2F' }}>{error}</p>}

      {shown.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {t('해당하는 주문이 없습니다.', 'Không có đơn phù hợp.', 'No matching orders.')}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {shown.map((o) => {
            const candidates = candidatesFor(o.category_id);

            return (
              <article key={o.id} className="rounded-2xl border p-4" style={{ background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #ebebed)' }}>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>
                    {categoryLabel(o.category_id)}
                  </span>
                  <OrderStatusBadge status={o.status} locale={locale} />
                </div>

                <p className="mt-1.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {o.order_type} · 🕒 {formatDateTime(o.scheduled_at, locale)}
                </p>
                <p className="mt-0.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>📍 {o.address}</p>
                <p className="mt-0.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  👤 {t('고객', 'Khách', 'Customer')} {nameOf(o.customer_uid)}
                  {o.technician_uid && ` · 🛠️ ${nameOf(o.technician_uid)}`}
                </p>

                {o.status === 'pending' && (
                  <div className="mt-3">
                    {candidates.length === 0 ? (
                      <p className="text-[11px]" style={{ color: '#D32F2F' }}>
                        {t(
                          '이 분야를 담당할 활성 기술자가 없습니다. 기술자 프로필의 기술 분야를 확인해 주세요.',
                          'Không có KTV hoạt động cho lĩnh vực này.',
                          'No active technician covers this category.'
                        )}
                      </p>
                    ) : (
                      <div className="flex gap-2">
                        <select
                          value={assignTo[o.id] ?? ''}
                          onChange={(e) => setAssignTo({ ...assignTo, [o.id]: e.target.value })}
                          className="flex-1 rounded-xl border px-3 py-2.5 text-sm outline-none"
                          style={{ background: 'var(--color-bg, #f7f7f8)', borderColor: 'var(--color-border, #ebebed)', color: 'var(--color-text)' }}
                        >
                          <option value="">{t('-- 기술자 선택 --', '-- Chọn KTV --', '-- Select technician --')}</option>
                          {candidates.map((c) => (
                            <option key={c.uid} value={c.uid}>
                              {nameOf(c.uid)} · ⭐ {c.rating.toFixed(1)}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => void handleAssign(o.id)}
                          disabled={acting !== null || !assignTo[o.id]}
                          className="rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                          style={{ background: 'var(--color-primary)' }}
                        >
                          {t('배정', 'Phân công', 'Assign')}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {o.status === 'in_progress' && (
                  <div className="mt-3">
                    <button
                      onClick={() => void handleForceComplete(o.id)}
                      disabled={acting !== null}
                      className="w-full rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-50"
                      style={{ background: '#388E3C' }}
                    >
                      {t('강제 완료 처리', 'Hoàn tất thủ công', 'Force complete')}
                    </button>
                    <p className="mt-1 text-[11px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                      {t(
                        '고객이 72시간 내 승인하지 않은 경우에만 사용하세요. 정산과 30일 워런티가 즉시 생성되며, BM 에스크로는 자동으로 해제되지 않습니다.',
                        'Chỉ dùng khi khách không xác nhận trong 72 giờ. Thanh toán và bảo hành 30 ngày được tạo ngay; ký quỹ BM KHÔNG tự giải ngân.',
                        'Use only when the customer has not approved within 72 hours. The settlement and 30-day warranty are created immediately; the BM escrow is NOT released automatically.'
                      )}
                    </p>
                  </div>
                )}

                {o.status !== 'completed' && o.status !== 'cancelled' && (
                  <button
                    onClick={() => void handleCancel(o.id)}
                    disabled={acting !== null}
                    className="mt-2 w-full rounded-xl border py-2 text-xs font-bold disabled:opacity-50"
                    style={{ borderColor: 'var(--color-border, #ebebed)', color: '#D32F2F' }}
                  >
                    {t('주문 취소', 'Hủy đơn', 'Cancel order')}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
