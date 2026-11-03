'use client';

import { useEffect, useState } from 'react';
import { useSupabase } from '@/hooks/useSupabase';

interface RankRow {
  rank: number;
  display_name: string;
  completed_count: number;
  rating: number;
  rating_count: number;
}

const MEDAL = ['🥇', '🥈', '🥉'];

/** 미션(완료 주문)을 가장 많이 수행한 기술자 TOP 10. 이름은 서버에서 가려서 내려온다. */
export default function TopTechnicians({ locale }: { locale: string }) {
  const supabase = useSupabase();
  const [rows, setRows] = useState<RankRow[] | null>(null);

  const t = (ko: string, vi: string, en: string) =>
    locale === 'vi' ? vi : locale === 'en' ? en : ko;

  useEffect(() => {
    let alive = true;
    void supabase.rpc('technician_ranking', { p_limit: 10 }).then(({ data, error }) => {
      if (alive) setRows(error ? [] : ((data ?? []) as RankRow[]));
    });
    return () => {
      alive = false;
    };
  }, [supabase]);

  return (
    <section className="px-4 pb-8" aria-labelledby="top-tech-title">
      <h2 id="top-tech-title" className="mb-1 text-lg font-extrabold" style={{ color: 'var(--color-text)' }}>
        🏆 {t('미션 랭킹 TOP 10', 'Top 10 kỹ thuật viên xuất sắc', 'Top 10 Technicians')}
      </h2>
      <p className="mb-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        {t('미션을 가장 많이 완료한 기술자예요.', 'Những kỹ thuật viên hoàn thành nhiều nhiệm vụ nhất.', 'Technicians who completed the most missions.')}
      </p>

      {rows === null ? (
        <div className="h-24 animate-pulse rounded-2xl" style={{ background: 'var(--color-border)' }} aria-hidden />
      ) : rows.length === 0 ? (
        <p
          className="rounded-2xl border px-4 py-6 text-center text-xs"
          style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
        >
          {t('아직 완료된 미션이 없어요. 첫 번째 랭커가 되어 보세요!', 'Chưa có nhiệm vụ hoàn thành. Hãy là người đầu tiên!', 'No completed missions yet. Be the first on the board!')}
        </p>
      ) : (
        <ol className="overflow-hidden rounded-2xl border" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
          {rows.map((r, i) => (
            <li
              key={r.rank}
              className="flex items-center gap-3 px-4 py-3"
              style={i > 0 ? { borderTop: '1px solid var(--color-border)' } : undefined}
            >
              <span className="w-7 shrink-0 text-center text-lg font-extrabold" style={{ color: 'var(--color-text-muted)' }}>
                {r.rank <= 3 ? MEDAL[r.rank - 1] : r.rank}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-bold" style={{ color: 'var(--color-text)' }}>
                {r.display_name}
              </span>
              {r.rating_count > 0 && (
                <span className="shrink-0 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  ⭐ {Number(r.rating).toFixed(1)}
                </span>
              )}
              <span className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-extrabold text-white" style={{ background: 'var(--color-navy, #1A237E)' }}>
                {r.completed_count}
                {t('건', ' đơn', ' done')}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
