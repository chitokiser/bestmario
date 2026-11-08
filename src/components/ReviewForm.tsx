'use client';

import { useEffect, useRef, useState } from 'react';
import { useSupabase } from '@/hooks/useSupabase';

interface MyReview {
  rating: number;
  comment: string;
}

const PRAISE_TAGS = [
  { id: 'fast', labelKo: '⚡ 신속한 방문', labelVi: '⚡ Đến nhanh', labelEn: '⚡ Fast Arrival' },
  { id: 'expert', labelKo: '🔧 완벽한 기술/수리', labelVi: '🔧 Kỹ thuật tốt', labelEn: '🔧 Expert Repair' },
  { id: 'kind', labelKo: '💬 친절한 설명', labelVi: '💬 Nhiệt tình, chu đáo', labelEn: '💬 Friendly' },
  { id: 'honest', labelKo: '💰 정직한 견적', labelVi: '💰 Giá cả minh bạch', labelEn: '💰 Honest Price' },
  { id: 'clean', labelKo: '🧹 깔끔한 뒷정리', labelVi: '🧹 Dọn dẹp sạch sẽ', labelEn: '🧹 Clean Work' },
  { id: 'punctual', labelKo: '⏰ 약속 시간 철저', labelVi: '⏰ Đúng giờ', labelEn: '⏰ Punctual' },
];

const RATING_PHRASES: Record<number, { ko: string; vi: string; en: string }> = {
  5: { ko: '최고예요! 완벽하게 해결되었어요 💯', vi: 'Tuyệt vời! Rất hài lòng 💯', en: 'Outstanding! Fully resolved 💯' },
  4: { ko: '만족스러워요! 주변에 추천합니다 👍', vi: 'Hài lòng! Sẽ giới thiệu 👍', en: 'Satisfied! Highly recommended 👍' },
  3: { ko: '보통이에요. 수리는 잘 끝났어요.', vi: 'Bình thường. Đã xong việc.', en: 'Average. Job done.' },
  2: { ko: '조금 아쉬운 점이 있었어요.', vi: 'Có điểm chưa hài lòng.', en: 'Somewhat disappointed.' },
  1: { ko: '개선이 필요합니다.', vi: 'Cần cải thiện chất lượng.', en: 'Needs improvement.' },
};

/** 완료된 주문에 별점·후기·시공사진을 남기는 카드. */
export default function ReviewForm({ orderId, locale }: { orderId: string; locale: string }) {
  const supabase = useSupabase();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const t = (ko: string, vi: string, en: string) =>
    locale === 'vi' ? vi : locale === 'en' ? en : ko;

  const [loaded, setLoaded] = useState(false);
  const [mine, setMine] = useState<MyReview | null>(null);
  const [rating, setRating] = useState(5);
  const [selectedTags, setSelectedTags] = useState<string[]>(['fast', 'expert']);
  const [comment, setComment] = useState('');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
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

  const toggleTag = (id: string) => {
    setSelectedTags((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handlePhotoSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      setPhotoPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const submit = async () => {
    if (rating < 1 || busy) return;
    setBusy(true);
    setError(null);

    // 태그 텍스트 포맷
    const chosenTagLabels = PRAISE_TAGS.filter((t) => selectedTags.includes(t.id))
      .map((t) => (locale === 'vi' ? t.labelVi : locale === 'en' ? t.labelEn : t.labelKo))
      .join(' · ');

    let fullComment = '';
    if (chosenTagLabels) {
      fullComment += `[${chosenTagLabels}]\n`;
    }
    if (comment.trim()) {
      fullComment += comment.trim();
    }
    if (photoPreview) {
      // 로컬 스토리지에 사진 캐싱
      try {
        localStorage.setItem(`review_photo_${orderId}`, photoPreview);
      } catch {}
    }

    const { error: err } = await supabase.rpc('submit_review', {
      p_order_id: orderId,
      p_rating: rating,
      p_comment: fullComment.slice(0, 1000),
    });

    if (err) {
      setError(err.message);
    } else {
      setMine({ rating, comment: fullComment });
    }
    setBusy(false);
  };

  if (!loaded) return null;

  const cardStyle = {
    background: 'var(--color-surface, #fff)',
    borderColor: 'var(--color-border, #ebebed)',
  } as const;

  // 작성된 리뷰 보기
  if (mine) {
    const savedPhoto = typeof window !== 'undefined' ? localStorage.getItem(`review_photo_${orderId}`) : null;

    return (
      <section className="rounded-3xl border p-5 shadow-sm space-y-3" style={cardStyle}>
        <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--color-border, #ebebed)' }}>
          <h2 className="text-sm font-extrabold flex items-center gap-1.5" style={{ color: 'var(--color-text)' }}>
            <span>⭐</span>
            <span>{t('내가 작성한 시공 만족도 평가', 'Đánh giá dịch vụ của tôi', 'My Review')}</span>
          </h2>
          <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 rounded-full px-2 py-0.5">
            ✓ {t('반영 완료', 'Đã ghi nhận', 'Submitted')}
          </span>
        </div>

        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl text-amber-500 font-black">
              {'★'.repeat(mine.rating)}
              <span className="text-gray-300">{'★'.repeat(5 - mine.rating)}</span>
            </span>
            <span className="text-xs font-bold text-gray-700">
              {RATING_PHRASES[mine.rating]?.[locale as 'ko' | 'vi' | 'en']}
            </span>
          </div>

          {mine.comment && (
            <p className="mt-2 text-xs leading-relaxed text-gray-700 whitespace-pre-wrap bg-gray-50 p-3 rounded-2xl border border-gray-100">
              {mine.comment}
            </p>
          )}

          {savedPhoto && (
            <div className="mt-3">
              <p className="text-[10px] font-bold text-gray-500 mb-1">📷 {t('등록된 시공 사진', 'Ảnh đã chụp', 'Attached Photo')}</p>
              <img
                src={savedPhoto}
                alt="Review Photo"
                className="w-24 h-24 rounded-2xl object-cover border border-gray-200 shadow-xs"
              />
            </div>
          )}
        </div>
      </section>
    );
  }

  // 리뷰 작성 폼
  return (
    <section className="space-y-4 rounded-3xl border p-5 shadow-sm" style={cardStyle}>
      <div>
        <h2 className="text-sm font-extrabold flex items-center gap-1.5" style={{ color: 'var(--color-text)' }}>
          <span>⭐</span>
          <span>{t('작업 만족도는 어떠셨나요?', 'Bạn hài lòng với dịch vụ không?', 'How was the service?')}</span>
        </h2>
        <p className="text-[11px] text-gray-500 mt-0.5">
          {t('고객님의 소중한 평가는 기술자 랭킹과 서비스 품질 향상에 즉시 반영됩니다.', 'Đánh giá của bạn giúp nâng cao chất lượng kỹ thuật viên.', 'Your review directly impacts the technician leaderboard.')}
        </p>
      </div>

      {/* 별점 선택 */}
      <div className="rounded-2xl bg-amber-50/60 p-4 border border-amber-200/70 text-center space-y-1.5">
        <div className="flex justify-center gap-1.5" role="radiogroup" aria-label={t('별점', 'Số sao', 'Rating')}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              onClick={() => setRating(n)}
              className="text-4xl leading-none transition-transform active:scale-90 hover:scale-110"
              style={{ color: n <= rating ? '#F57F17' : '#D1D5DB' }}
            >
              ★
            </button>
          ))}
        </div>
        <p className="text-xs font-black text-amber-950">
          {RATING_PHRASES[rating]?.[locale as 'ko' | 'vi' | 'en']}
        </p>
      </div>

      {/* 칭찬 태그 선택 */}
      <div>
        <label className="block text-[11px] font-bold text-gray-500 mb-1.5 uppercase tracking-wide">
          {t('어떤 점이 좋으셨나요? (중복 선택 가능)', 'Bạn ấn tượng điểm nào nhất?', 'What did you like?')}
        </label>
        <div className="flex flex-wrap gap-1.5">
          {PRAISE_TAGS.map((tag) => {
            const isSelected = selectedTags.includes(tag.id);
            const label = locale === 'vi' ? tag.labelVi : locale === 'en' ? tag.labelEn : tag.labelKo;
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggleTag(tag.id)}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold border transition-all active:scale-95 ${
                  isSelected
                    ? 'bg-amber-100 border-amber-400 text-amber-950 shadow-xs'
                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 시공 사진 첨부 (포토 리뷰) */}
      <div>
        <label className="block text-[11px] font-bold text-gray-500 mb-1.5 uppercase tracking-wide">
          📷 {t('시공 완료 사진 첨부 (선택)', 'Thêm ảnh thực tế (tùy chọn)', 'Attach Photo (Optional)')}
        </label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => handlePhotoSelect(e.target.files)}
          className="hidden"
        />

        {photoPreview ? (
          <div className="relative w-24 h-24 rounded-2xl overflow-hidden border border-gray-200 shadow-xs">
            <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => setPhotoPreview(null)}
              className="absolute top-1 right-1 rounded-full bg-black/60 text-white w-5 h-5 flex items-center justify-center text-xs"
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-xl border border-dashed border-gray-300 px-4 py-2 text-xs font-semibold text-gray-600 hover:border-red-400 hover:text-red-600 flex items-center gap-1.5 transition-colors"
          >
            <span>📸</span>
            <span>{t('사진 촬영 또는 갤러리 선택', 'Chụp ảnh hoặc tải từ thư viện', 'Snap photo or choose from gallery')}</span>
          </button>
        )}
      </div>

      {/* 후기 텍스트 */}
      <div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={1000}
          rows={3}
          placeholder={t(
            '기술자님에게 전하고 싶은 말씀이나 수리 후기를 남겨주세요.',
            'Viết thêm nhận xét chi tiết cho kỹ thuật viên…',
            'Leave detailed feedback for the technician…'
          )}
          className="w-full rounded-2xl border px-3.5 py-3 text-xs outline-none resize-none"
          style={{
            background: 'var(--color-bg, #f7f7f8)',
            borderColor: 'var(--color-border, #ebebed)',
            color: 'var(--color-text)',
          }}
        />
      </div>

      {error && (
        <p className="text-xs font-semibold" style={{ color: '#D32F2F' }} role="alert">
          ⚠️ {error}
        </p>
      )}

      <button
        onClick={() => void submit()}
        disabled={rating < 1 || busy}
        className="w-full rounded-2xl py-3 text-sm font-extrabold text-white shadow-sm transition-transform active:scale-98 disabled:opacity-50"
        style={{ background: 'var(--color-primary)' }}
      >
        {busy ? t('등록 중…', 'Đang gửi…', 'Submitting…') : t('⭐ 리뷰 등록 완료하기', 'Gửi đánh giá ngay', 'Submit Review')}
      </button>
    </section>
  );
}
