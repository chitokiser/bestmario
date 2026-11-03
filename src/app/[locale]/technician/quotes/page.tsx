'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { useTechnicianOrders } from '@/hooks/useTechnicianOrders';
import { useSupabase } from '@/hooks/useSupabase';
import { useAuthState } from '@/hooks/useAuthState';
import { formatDateTime, formatVND, localizedName } from '@/lib/format';
import type { Quotation, ServiceCategory } from '@/types/supabase';

interface DraftState {
  price: string;
  durationMin: string;
  note: string;
}

const EMPTY_DRAFT: DraftState = { price: '', durationMin: '', note: '' };

export default function TechnicianQuotesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  const supabase = useSupabase();
  const { user } = useAuthState();
  const { pendingOrders, loading } = useTechnicianOrders();

  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [myQuotes, setMyQuotes] = useState<Quotation[]>([]);
  const [openOrder, setOpenOrder] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const t = (ko: string, vi: string, en: string) =>
    locale === 'vi' ? vi : locale === 'en' ? en : ko;

  const loadMyQuotes = useCallback(async () => {
    if (!user) {
      setMyQuotes([]);
      return;
    }
    const { data } = await supabase
      .from('quotations')
      .select('*')
      .eq('technician_uid', user.uid);
    setMyQuotes((data ?? []) as Quotation[]);
  }, [supabase, user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('service_categories').select('*');
      if (!cancelled) setCategories((data ?? []) as ServiceCategory[]);
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  useEffect(() => {
    void loadMyQuotes();
  }, [loadMyQuotes]);

  const quoteRequests = pendingOrders.filter((o) => o.order_type === 'quote_request');

  const quoteFor = (orderId: string) => myQuotes.find((q) => q.order_id === orderId) ?? null;

  const categoryLabel = (id: string) => {
    const c = categories.find((x) => x.id === id);
    return c ? `${c.icon} ${localizedName(c, locale)}` : id;
  };

  // 목록 안에서는 useQuotations 를 주문별로 호출할 수 없으므로(훅 규칙) 직접 INSERT 한다.
  // 5건 제한은 003_functions.sql 의 enforce_quotation_limit 트리거가 강제한다.
  const handleSubmit = async (orderId: string) => {
    if (submitting || !user) return;

    const price = Number(draft.price);
    const duration = Number(draft.durationMin);

    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(duration) || duration <= 0) {
      setError(t('금액과 예상 소요시간을 올바르게 입력해 주세요.', 'Hãy nhập đúng giá và thời gian dự kiến.', 'Enter a valid price and duration.'));
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const { error: err } = await supabase.from('quotations').insert({
        order_id: orderId,
        technician_uid: user.uid,
        price,
        duration_min: duration,
        note: draft.note.trim(),
        status: 'submitted',
      });
      if (err) throw new Error(err.message);

      setOpenOrder(null);
      setDraft(EMPTY_DRAFT);
      await loadMyQuotes();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{t('불러오는 중…', 'Đang tải…', 'Loading…')}</p>;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-base font-extrabold" style={{ color: 'var(--color-text)' }}>
        {t('견적 제출', 'Gửi báo giá', 'Submit quotes')}
      </h1>

      {error && <p className="text-xs font-semibold" style={{ color: '#D32F2F' }}>{error}</p>}

      {quoteRequests.length === 0 ? (
        <div className="rounded-2xl border p-6 text-center" style={{ background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #ebebed)' }}>
          <div className="text-3xl mb-2">🧾</div>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            {t(
              '견적을 기다리는 주문이 없습니다. 프로필의 기술 분야를 늘리면 더 많은 요청을 받습니다.',
              'Chưa có đơn nào cần báo giá. Thêm lĩnh vực trong hồ sơ để nhận nhiều hơn.',
              'No orders awaiting a quote. Add more skills in your profile to receive more.'
            )}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {quoteRequests.map((o) => {
            const mine = quoteFor(o.id);
            const isOpen = openOrder === o.id;

            return (
              <article key={o.id} className="rounded-2xl border p-4" style={{ background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #ebebed)' }}>
                <p className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>
                  {categoryLabel(o.category_id)}
                </p>
                <p className="mt-1.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  🕒 {formatDateTime(o.scheduled_at, locale)}
                </p>
                <p className="mt-0.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>📍 {o.address}</p>
                {o.note && (
                  <p className="mt-2 text-xs whitespace-pre-line leading-relaxed" style={{ color: 'var(--color-text-2, #5c5c6e)' }}>
                    {o.note}
                  </p>
                )}

                {o.photos_before.length > 0 && (
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {o.photos_before.map((url) => (
                      <img key={url} src={url} alt="" loading="lazy" decoding="async" className="w-full aspect-square object-cover rounded-lg bg-gray-100" />
                    ))}
                  </div>
                )}

                {mine ? (
                  // 제출한 견적은 수정 불가 (unique(order_id, technician_uid))
                  <div className="mt-3 rounded-xl p-3" style={{ background: 'var(--color-bg, #f7f7f8)' }}>
                    <p className="text-xs font-bold" style={{ color: 'var(--color-primary)' }}>
                      {t('제출 완료', 'Đã gửi', 'Submitted')} · {formatVND(mine.price)} · {mine.duration_min}
                      {t('분', ' phút', 'm')}
                    </p>
                    <p className="mt-1 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                      {t('제출한 견적은 수정할 수 없습니다.', 'Báo giá đã gửi không thể sửa.', 'A submitted quote cannot be edited.')}
                    </p>
                  </div>
                ) : isOpen ? (
                  <div className="mt-3 space-y-2">
                    <input
                      type="number"
                      min={1}
                      value={draft.price}
                      onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                      placeholder={t('견적 금액 (VND)', 'Giá báo (VND)', 'Quote price (VND)')}
                      className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
                      style={{ background: 'var(--color-bg, #f7f7f8)', borderColor: 'var(--color-border, #ebebed)', color: 'var(--color-text)' }}
                    />
                    <input
                      type="number"
                      min={1}
                      value={draft.durationMin}
                      onChange={(e) => setDraft({ ...draft, durationMin: e.target.value })}
                      placeholder={t('예상 소요시간 (분)', 'Thời gian dự kiến (phút)', 'Estimated duration (min)')}
                      className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
                      style={{ background: 'var(--color-bg, #f7f7f8)', borderColor: 'var(--color-border, #ebebed)', color: 'var(--color-text)' }}
                    />
                    <textarea
                      rows={2}
                      value={draft.note}
                      onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                      placeholder={t('작업 범위·자재 등 설명', 'Mô tả phạm vi, vật liệu…', 'Scope, materials, notes…')}
                      className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none resize-none"
                      style={{ background: 'var(--color-bg, #f7f7f8)', borderColor: 'var(--color-border, #ebebed)', color: 'var(--color-text)' }}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => void handleSubmit(o.id)}
                        disabled={submitting}
                        className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-50"
                        style={{ background: 'var(--color-primary)' }}
                      >
                        {submitting ? t('제출 중…', 'Đang gửi…', 'Submitting…') : t('견적 제출', 'Gửi báo giá', 'Submit quote')}
                      </button>
                      <button
                        onClick={() => { setOpenOrder(null); setDraft(EMPTY_DRAFT); }}
                        className="rounded-xl border px-4 py-2.5 text-sm font-bold"
                        style={{ borderColor: 'var(--color-border, #ebebed)', color: 'var(--color-text-muted)' }}
                      >
                        {t('취소', 'Hủy', 'Cancel')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => { setOpenOrder(o.id); setDraft(EMPTY_DRAFT); setError(null); }}
                    className="mt-3 w-full rounded-xl py-2.5 text-sm font-bold text-white"
                    style={{ background: 'var(--color-primary)' }}
                  >
                    {t('견적 제출하기', 'Gửi báo giá', 'Submit a quote')}
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
