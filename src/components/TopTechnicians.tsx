'use client';

import { useEffect, useState } from 'react';
import { useSupabase } from '@/hooks/useSupabase';

interface Job {
  at: string;
  cat: { ko: string; vi: string; en: string; icon: string } | null;
  item: { ko: string | null; vi: string | null } | null;
}
interface Review {
  rating: number;
  comment: string;
  by: string;
  at: string;
}
interface RankRow {
  rank: number;
  display_name: string;
  completed_count: number;
  rating: number;
  rating_count: number;
  recent_jobs: Job[];
  recent_reviews: Review[];
}

const MEDAL = ['🥇', '🥈', '🥉'];

function Stars({ value }: { value: number }) {
  const full = Math.round(value);
  return (
    <span aria-label={`${value.toFixed(1)} / 5`} style={{ color: '#F9A825', letterSpacing: 1 }}>
      {'★'.repeat(full)}
      <span style={{ color: 'var(--color-border)' }}>{'★'.repeat(5 - full)}</span>
    </span>
  );
}

/** 미션(완료 주문)을 가장 많이 수행한 기술자 TOP 10. 줄을 누르면 평점·최근 작업·리뷰가 펼쳐진다. */
export default function TopTechnicians({ locale }: { locale: string }) {
  const supabase = useSupabase();
  const [rows, setRows] = useState<RankRow[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);

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

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale === 'vi' ? 'vi-VN' : locale === 'en' ? 'en-US' : 'ko-KR', {
      month: 'short',
      day: 'numeric',
    });

  const jobTitle = (j: Job) => {
    const item = j.item ? (locale === 'vi' ? j.item.vi : j.item.ko) : null;
    const cat = j.cat ? (locale === 'vi' ? j.cat.vi : locale === 'en' ? j.cat.en : j.cat.ko) : '';
    return item || cat || '-';
  };

  return (
    <section className="px-4 pb-8" aria-labelledby="top-tech-title">
      <h2 id="top-tech-title" className="mb-1 text-lg font-extrabold" style={{ color: 'var(--color-text)' }}>
        🏆 {t('미션 랭킹 TOP 10', 'Top 10 kỹ thuật viên xuất sắc', 'Top 10 Technicians')}
      </h2>
      <p className="mb-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        {t('미션을 가장 많이 완료한 기술자예요. 눌러서 작업 내역과 리뷰를 확인하세요.', 'Những kỹ thuật viên hoàn thành nhiều nhiệm vụ nhất. Nhấn để xem công việc và đánh giá.', 'Technicians who completed the most missions. Tap to see jobs and reviews.')}
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
          {rows.map((r, i) => {
            const isOpen = open === r.rank;
            return (
              <li key={r.rank} style={i > 0 ? { borderTop: '1px solid var(--color-border)' } : undefined}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : r.rank)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                >
                  <span className="w-7 shrink-0 text-center text-lg font-extrabold" style={{ color: 'var(--color-text-muted)' }}>
                    {r.rank <= 3 ? MEDAL[r.rank - 1] : r.rank}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold" style={{ color: 'var(--color-text)' }}>
                      {r.display_name}
                    </span>
                    <span className="block text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                      {r.rating_count > 0 ? (
                        <>
                          <Stars value={Number(r.rating)} /> {Number(r.rating).toFixed(1)} ({r.rating_count})
                        </>
                      ) : (
                        t('아직 리뷰가 없어요', 'Chưa có đánh giá', 'No reviews yet')
                      )}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-extrabold text-white" style={{ background: 'var(--color-navy, #1A237E)' }}>
                    {r.completed_count}
                    {t('건', ' đơn', ' done')}
                  </span>
                  <span aria-hidden className="shrink-0 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {isOpen ? '▲' : '▼'}
                  </span>
                </button>

                {isOpen && (
                  <div className="space-y-4 px-4 pb-4">
                    <div>
                      <h3 className="mb-1.5 text-xs font-bold" style={{ color: 'var(--color-text)' }}>
                        {t('최근 완료한 작업', 'Công việc gần đây', 'Recent jobs')}
                      </h3>
                      <ul className="space-y-1.5">
                        {r.recent_jobs.map((j, k) => (
                          <li key={k} className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                            <span aria-hidden>{j.cat?.icon ?? '🛠️'}</span>
                            <span className="min-w-0 flex-1 truncate" style={{ color: 'var(--color-text)' }}>{jobTitle(j)}</span>
                            <span className="shrink-0">✓ {fmtDate(j.at)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <h3 className="mb-1.5 text-xs font-bold" style={{ color: 'var(--color-text)' }}>
                        {t('최근 리뷰', 'Đánh giá gần đây', 'Recent reviews')}
                      </h3>
                      {r.recent_reviews.length === 0 ? (
                        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                          {t('아직 남겨진 리뷰가 없어요.', 'Chưa có đánh giá nào.', 'No reviews yet.')}
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {r.recent_reviews.map((v, k) => (
                            <li
                              key={k}
                              className="rounded-xl px-3 py-2 text-xs"
                              style={{ background: 'color-mix(in srgb, var(--color-text) 6%, transparent)' }}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <Stars value={v.rating} />
                                <span style={{ color: 'var(--color-text-muted)' }}>{v.by} · {fmtDate(v.at)}</span>
                              </div>
                              {v.comment && (
                                <p className="mt-1 whitespace-pre-wrap break-words" style={{ color: 'var(--color-text)' }}>{v.comment}</p>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
