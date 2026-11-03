'use client';

import type { OrderStatus } from '@/types/supabase';

const STATUS_META: Record<
  OrderStatus,
  { ko: string; vi: string; en: string; color: string; bg: string }
> = {
  pending:     { ko: '배정 대기',      vi: 'Chờ phân công',   en: 'Pending',     color: '#FFA000', bg: '#FFF8E1' },
  assigned:    { ko: '기술자 배정됨',  vi: 'Đã phân công',    en: 'Assigned',    color: '#1976D2', bg: '#E3F2FD' },
  in_progress: { ko: '진행 중',        vi: 'Đang thực hiện',  en: 'In Progress', color: '#388E3C', bg: '#E8F5E9' },
  completed:   { ko: '완료',           vi: 'Hoàn thành',      en: 'Completed',   color: '#616161', bg: '#F5F5F5' },
  cancelled:   { ko: '취소',           vi: 'Đã hủy',          en: 'Cancelled',   color: '#D32F2F', bg: '#FFEBEE' },
  disputed:    { ko: '분쟁 중',        vi: 'Đang tranh chấp', en: 'Disputed',    color: '#7B1FA2', bg: '#F3E5F5' },
};

export function orderStatusLabel(status: OrderStatus, locale: string): string {
  const meta = STATUS_META[status];
  if (locale === 'vi') return meta.vi;
  if (locale === 'en') return meta.en;
  return meta.ko;
}

export default function OrderStatusBadge({
  status,
  locale = 'vi',
}: {
  status: OrderStatus;
  locale?: string;
}) {
  const meta = STATUS_META[status];

  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold whitespace-nowrap"
      style={{ color: meta.color, background: meta.bg }}
    >
      {orderStatusLabel(status, locale)}
    </span>
  );
}
