'use client';

import { useState } from 'react';
import { useQuotations, type QuotationWithTechnician } from '@/hooks/useQuotations';
import { formatVND } from '@/lib/format';

function L(locale: string, ko: string, vi: string, en: string) {
  if (locale === 'vi') return vi;
  if (locale === 'en') return en;
  return ko;
}

function durationLabel(min: number, locale: string) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const hUnit = L(locale, '시간', 'giờ', 'h');
  const mUnit = L(locale, '분', 'phút', 'm');
  if (h === 0) return `${m}${mUnit}`;
  if (m === 0) return `${h}${hUnit}`;
  return `${h}${hUnit} ${m}${mUnit}`;
}

export default function QuoteList({
  orderId,
  locale = 'vi',
  selectable = true,
  onAccept,
}: {
  orderId: string;
  locale?: string;
  /** 주문이 이미 배정된 뒤에는 선택 버튼을 숨긴다 */
  selectable?: boolean;
  onAccept?: (q: QuotationWithTechnician) => void;
}) {
  const { quotations, loading, error, acceptQuotation } = useQuotations(orderId);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  const handleAccept = async (q: QuotationWithTechnician) => {
    if (accepting) return;
    setAccepting(q.id);
    setAcceptError(null);
    try {
      await acceptQuotation(q.id);
      onAccept?.(q);
    } catch (e) {
      setAcceptError(e instanceof Error ? e.message : String(e));
    } finally {
      setAccepting(null);
    }
  };

  if (loading) {
    return (
      <p className="text-sm py-4" style={{ color: 'var(--color-text-muted)' }}>
        {L(locale, '견적을 불러오는 중…', 'Đang tải báo giá…', 'Loading quotes…')}
      </p>
    );
  }

  if (error) {
    return <p className="text-sm font-semibold py-4" style={{ color: '#D32F2F' }}>{error}</p>;
  }

  // Review Focus #3 — 견적 0건일 때 무한 대기로 보이지 않도록 빈 상태를 명시한다
  if (quotations.length === 0) {
    return (
      <div className="rounded-2xl border p-6 text-center" style={{ background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #ebebed)' }}>
        <div className="text-3xl mb-2">📭</div>
        <p className="text-sm font-bold mb-1" style={{ color: 'var(--color-text)' }}>
          {L(locale, '아직 접수된 견적이 없습니다', 'Chưa có báo giá nào', 'No quotes yet')}
        </p>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
          {L(
            locale,
            '기술자가 견적을 제출하면 알려드립니다. 보통 1~24시간이 걸리며, 최대 5건까지 받습니다.',
            'Chúng tôi sẽ thông báo khi có báo giá. Thường mất 1~24 giờ, tối đa 5 báo giá.',
            'We will notify you when a technician submits a quote. This usually takes 1–24 hours, up to 5 quotes.'
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {acceptError && (
        <p className="text-xs font-semibold" style={{ color: '#D32F2F' }}>{acceptError}</p>
      )}

      {quotations.map((q) => {
        const isAccepted = q.status === 'accepted';
        const isRejected = q.status === 'rejected';

        return (
          <article
            key={q.id}
            className="rounded-2xl border p-4"
            style={{
              background: 'var(--color-surface, #fff)',
              borderColor: isAccepted ? 'var(--color-primary)' : 'var(--color-border, #ebebed)',
              opacity: isRejected ? 0.55 : 1,
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold truncate" style={{ color: 'var(--color-text)' }}>
                  {q.technician?.name || L(locale, '기술자', 'Kỹ thuật viên', 'Technician')}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                  ⭐ {(q.technician?.rating ?? 0).toFixed(1)} ({q.technician?.rating_count ?? 0})
                  {' · '}
                  {L(locale, '예상', 'Dự kiến', 'Est.')} {durationLabel(q.duration_min, locale)}
                </p>
              </div>
              <span className="text-lg font-extrabold whitespace-nowrap" style={{ color: 'var(--color-primary)' }}>
                {formatVND(q.price)}
              </span>
            </div>

            {q.note && (
              <p className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--color-text-2, #5c5c6e)' }}>
                {q.note}
              </p>
            )}

            {isAccepted ? (
              <p className="mt-3 text-xs font-bold" style={{ color: 'var(--color-primary)' }}>
                ✓ {L(locale, '선택한 견적입니다', 'Báo giá đã chọn', 'Selected quote')}
              </p>
            ) : isRejected ? (
              <p className="mt-3 text-xs font-semibold" style={{ color: 'var(--color-text-muted)' }}>
                {L(locale, '미선택', 'Không chọn', 'Not selected')}
              </p>
            ) : selectable ? (
              <button
                onClick={() => handleAccept(q)}
                disabled={accepting !== null}
                className="mt-3 w-full rounded-xl py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: 'var(--color-primary)' }}
              >
                {accepting === q.id
                  ? L(locale, '처리 중…', 'Đang xử lý…', 'Processing…')
                  : L(locale, '이 견적 선택', 'Chọn báo giá này', 'Choose this quote')}
              </button>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
