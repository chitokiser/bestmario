'use client';

import { use, useEffect, useState } from 'react';
import { useSupabase } from '@/hooks/useSupabase';
import { useAuthState } from '@/hooks/useAuthState';
import { formatDateTime, formatVND } from '@/lib/format';
import type { Settlement } from '@/types/supabase';

export default function TechnicianSettlementsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  const supabase = useSupabase();
  const { user } = useAuthState();

  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const t = (ko: string, vi: string, en: string) =>
    locale === 'vi' ? vi : locale === 'en' ? en : ko;

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    (async () => {
      const { data, error: err } = await supabase
        .from('settlements')
        .select('*')
        .eq('technician_uid', user.uid)
        .order('settled_at', { ascending: false });

      if (cancelled) return;
      if (err) setError(err.message);
      else setSettlements((data ?? []) as Settlement[]);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [supabase, user]);

  const totalGross = settlements.reduce((s, x) => s + x.gross_amount, 0);
  const totalNet = settlements.reduce((s, x) => s + x.net_amount, 0);

  if (loading) {
    return <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{t('불러오는 중…', 'Đang tải…', 'Loading…')}</p>;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-base font-extrabold" style={{ color: 'var(--color-text)' }}>
        {t('정산 내역', 'Thanh toán', 'Earnings')}
      </h1>

      {error && <p className="text-xs font-semibold" style={{ color: '#D32F2F' }}>{error}</p>}

      {/* 합계 */}
      <div className="rounded-2xl p-5" style={{ background: 'var(--color-primary-bg, #FFEBEE)' }}>
        <p className="text-xs font-semibold mb-1" style={{ color: 'var(--color-text-2)' }}>
          {t('총 정산 금액', 'Tổng nhận được', 'Total received')}
        </p>
        <p className="text-2xl font-extrabold" style={{ color: 'var(--color-primary)' }}>
          {formatVND(totalNet)}
        </p>
        <p className="mt-1 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          {t('총 매출', 'Tổng doanh thu', 'Gross')} {formatVND(totalGross)}
          {' · '}
          {t('건수', 'Số đơn', 'Jobs')} {settlements.length}
        </p>
      </div>

      {settlements.length === 0 ? (
        <div className="rounded-2xl border p-6 text-center" style={{ background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #ebebed)' }}>
          <div className="text-3xl mb-2">💰</div>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            {t(
              '정산 내역이 없습니다. 고객이 작업 완료를 승인하면 정산이 생성됩니다.',
              'Chưa có bản thanh toán. Sẽ được tạo khi khách xác nhận hoàn thành.',
              'No settlements yet. One is created when a customer approves the completed work.'
            )}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {settlements.map((s) => (
            <article key={s.id} className="rounded-2xl border p-4" style={{ background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #ebebed)' }}>
              <div className="flex items-baseline justify-between">
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {formatDateTime(s.settled_at, locale)}
                </span>
                <span className="text-base font-extrabold" style={{ color: 'var(--color-primary)' }}>
                  {formatVND(s.net_amount)}
                </span>
              </div>
              <p className="mt-1.5 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                {t('총액', 'Tổng', 'Gross')} {formatVND(s.gross_amount)}
                {' · '}
                {t('수수료', 'Phí', 'Fee')} {(s.fee_rate * 100).toFixed(1)}% (-{formatVND(s.gross_amount - s.net_amount)})
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
