'use client';

import { use, useEffect, useState } from 'react';
import { useSupabase } from '@/hooks/useSupabase';
import { formatVND } from '@/lib/format';
import type { Payment } from '@/types/supabase';

interface Stats {
  todayOrders: number;
  pendingOrders: number;
  activeTechnicians: number;
  completedRevenue: number;
  heldAmount: number;
}

export default function AdminDashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  const supabase = useSupabase();

  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const t = (ko: string, vi: string, en: string) =>
    locale === 'vi' ? vi : locale === 'en' ? en : ko;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const [today, pending, techs, payments] = await Promise.all([
        supabase
          .from('service_orders')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', startOfToday.toISOString()),
        supabase
          .from('service_orders')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending'),
        supabase
          .from('technician_profiles')
          .select('uid', { count: 'exact', head: true })
          .eq('status', 'active'),
        supabase.from('payments').select('amount, status'),
      ]);

      if (cancelled) return;

      const firstError = today.error ?? pending.error ?? techs.error ?? payments.error;
      if (firstError) {
        setError(firstError.message);
        return;
      }

      const rows = (payments.data ?? []) as Pick<Payment, 'amount' | 'status'>[];

      setStats({
        todayOrders: today.count ?? 0,
        pendingOrders: pending.count ?? 0,
        activeTechnicians: techs.count ?? 0,
        completedRevenue: rows.filter((p) => p.status === 'completed').reduce((s, p) => s + p.amount, 0),
        heldAmount: rows.filter((p) => p.status === 'held').reduce((s, p) => s + p.amount, 0),
      });
    })();

    return () => { cancelled = true; };
  }, [supabase]);

  if (error) {
    return <p className="text-sm font-semibold" style={{ color: '#D32F2F' }}>{error}</p>;
  }

  if (!stats) {
    return <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{t('불러오는 중…', 'Đang tải…', 'Loading…')}</p>;
  }

  const CARDS = [
    { label: t('오늘 주문', 'Đơn hôm nay', 'Orders today'), value: String(stats.todayOrders) },
    { label: t('배정 대기', 'Chờ phân công', 'Pending'), value: String(stats.pendingOrders) },
    { label: t('활성 기술자', 'KTV đang hoạt động', 'Active technicians'), value: String(stats.activeTechnicians) },
    { label: t('완료 매출', 'Doanh thu đã xong', 'Completed revenue'), value: formatVND(stats.completedRevenue) },
    { label: t('에스크로 보관', 'Đang ký quỹ', 'Held in escrow'), value: formatVND(stats.heldAmount) },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-base font-extrabold" style={{ color: 'var(--color-text)' }}>
        {t('대시보드', 'Tổng quan', 'Dashboard')}
      </h1>

      <div className="grid grid-cols-2 gap-3">
        {CARDS.map((c) => (
          <div
            key={c.label}
            className="rounded-2xl border p-4"
            style={{ background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #ebebed)' }}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--color-text-muted)' }}>
              {c.label}
            </p>
            <p className="text-xl font-extrabold" style={{ color: 'var(--color-primary)' }}>{c.value}</p>
          </div>
        ))}
      </div>

      <p className="text-[11px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
        {t(
          '완료 매출은 결제 상태가 completed 인 건의 합계입니다. 에스크로 보관은 고객 완료 승인을 기다리는 금액입니다.',
          'Doanh thu đã xong là tổng các thanh toán ở trạng thái completed. Đang ký quỹ là số tiền chờ khách xác nhận.',
          'Completed revenue sums payments with status completed. Held in escrow is awaiting customer approval.'
        )}
      </p>
    </div>
  );
}
