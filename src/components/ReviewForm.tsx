'use client';

import { useEffect, useState } from 'react';
import { useSupabase } from '@/hooks/useSupabase';

interface MyReview {
  rating: number;
  comment: string;
}

/** 완료된 주문에 별점·후기를 남기는 카드. 주문당 1건이며 남긴 뒤에는 내용을 보여 준다. */
export default function ReviewForm({ orderId, locale }: { orderId: string; locale: string }) {
  const supabase = useSupabase();
  const t = (ko: string, vi: string, en: string) =>
    locale === 'vi' ? vi : locale === 'en' ? en : ko;

  const [loaded, setLoaded] = useState(false);
  const [mine, setMine] = useState<MyReview | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void supabase
      .from('reviews')
      .select('rating, comment')
      .eq('order_id', orderId)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive) return;
        setMine((data ?? null) as MyReview | null);
        setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [supabase, orderId]);

  const submit = async () => {
    if (rating < 1 || busy) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc('submit_review', {
      p_order_id: orderId,
      p_rating: rating,
      p_comment: comment.trim(),
    });
    if (err) setError(err.message);
    else setMine({ rating, comment: comment.trim() });
    setBusy(false);
  };

  if (!loaded) return null;

  const card = { background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #ebebed)' } as const;

  if (mine) {
    return (
      <section className="rounded-2xl border p-4" style={card}>
        <h2 className="text-sm font-extrabold" style={{ color: 'var(--color-text)' }}>
          ⭐ {t('내가 남긴 리뷰', 'Đánh giá của tôi', 'My review')}
        </h2>
        <p className="mt-1 text-lg" style={{ color: '#F9A825' }} aria-label={`${mine.rating} / 5`}>
          {'★'.repeat(mine.rating)}
          <span style={{ color: 'var(--color-border)' }}>{'★'.repeat(5 - mine.rating)}</span>
        </p>
        {mine.comment && (
          <p className="mt-1 whitespace-pre-wrap text-sm" style={{ color: 'var(--color-text)' }}>{mine.comment}</p>
        )}
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-2xl border p-4" style={card}>
      <h2 className="text-sm font-extrabold" style={{ color: 'var(--color-text)' }}>
        ⭐ {t('작업은 어떠셨나요?', 'Bạn thấy dịch vụ thế nào?', 'How was the service?')}
      </h2>
      <div className="flex gap-1" role="radiogroup" aria-label={t('별점', 'Số sao', 'Rating')}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n}`}
            onClick={() => setRating(n)}
            className="text-3xl leading-none"
            style={{ color: n <= rating ? '#F9A825' : 'var(--color-border, #ccc)' }}
          >
            ★
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={1000}
        rows={3}
        placeholder={t('후기를 남겨 주세요 (선택)', 'Viết nhận xét (tùy chọn)', 'Leave a comment (optional)')}
        className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
        style={{ background: 'var(--color-bg, #f7f7f8)', borderColor: 'var(--color-border, #ebebed)', color: 'var(--color-text)' }}
      />
      <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
        {t('리뷰는 기술자 랭킹에 이름을 가린 채 공개됩니다. 한 번 남기면 수정할 수 없어요.', 'Đánh giá hiển thị công khai trên bảng xếp hạng (đã ẩn tên) và không thể sửa.', 'Reviews appear on the leaderboard with your name masked and cannot be edited.')}
      </p>
      {error && <p className="text-xs font-semibold" style={{ color: '#D32F2F' }} role="alert">{error}</p>}
      <button
        onClick={() => void submit()}
        disabled={rating < 1 || busy}
        className="w-full rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-50"
        style={{ background: 'var(--color-primary)' }}
      >
        {busy ? t('등록 중…', 'Đang gửi…', 'Submitting…') : t('리뷰 등록', 'Gửi đánh giá', 'Submit review')}
      </button>
    </section>
  );
}
