'use client';

import { useEffect, useMemo, useState } from 'react';
import { useOrders } from '@/hooks/useOrders';
import { useSupabase } from '@/hooks/useSupabase';
import { useAuthState } from '@/hooks/useAuthState';
import { formatVND, localizedName } from '@/lib/format';
import type { ServiceCategory, ServiceOrder, ServiceProduct } from '@/types/supabase';

const FIELD_STYLE = {
  background: 'var(--color-bg, #f7f7f8)',
  borderColor: 'var(--color-border, #ebebed)',
  color: 'var(--color-text)',
} as const;

function L(locale: string, ko: string, vi: string, en: string) {
  if (locale === 'vi') return vi;
  if (locale === 'en') return en;
  return ko;
}

export default function OrderForm({
  categories,
  products,
  locale = 'vi',
  onSuccess,
}: {
  categories: ServiceCategory[];
  products: ServiceProduct[];
  locale?: string;
  onSuccess: (order: ServiceOrder) => void;
}) {
  const { createOrder, submitting } = useOrders();
  const supabase = useSupabase();
  const { user } = useAuthState();

  const [categoryId, setCategoryId] = useState('');
  const [productId, setProductId] = useState('');
  const [address, setAddress] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [note, setNote] = useState('');
  // 기술자가 배정되면 서로 연락(잘로·전화)해야 하므로 연락처를 받는다. 계정에 저장된 번호가 있으면 채워 둔다.
  const [phone, setPhone] = useState('');
  // 정찰가로 바로 예약 / 희망가 제시 (단순 작업으로 표시된 항목에서만)
  const [mode, setMode] = useState<'fixed' | 'bid'>('fixed');
  const [offer, setOffer] = useState('');
  const [floor, setFloor] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // createOrder 가 끝나면 훅의 잠금이 풀려 버튼이 다시 활성화된다. 라우팅이
  // 끝나기 전의 두 번째 탭이 두 번째 주문을 만들지 않도록 따로 잠근다.
  const [submitted, setSubmitted] = useState(false);

  const categoryProducts = useMemo(
    () => products.filter((p) => p.category_id === categoryId),
    [products, categoryId]
  );

  const selectedProduct = categoryProducts.find((p) => p.id === productId) ?? null;

  useEffect(() => {
    if (!user) return;
    let alive = true;
    void supabase.from('users').select('phone').eq('uid', user.uid).maybeSingle().then(({ data }) => {
      if (alive && data?.phone) setPhone((prev) => prev || (data.phone as string));
    });
    return () => {
      alive = false;
    };
  }, [supabase, user]);

  // 가장 최근 주문의 주소를 미리 채운다 (이미 입력한 값은 유지)
  useEffect(() => {
    if (!user) return;
    let alive = true;
    void supabase
      .from('service_orders')
      .select('address')
      .eq('customer_uid', user.uid)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (alive && data?.address) setAddress((prev) => prev || (data.address as string));
      });
    return () => {
      alive = false;
    };
  }, [supabase, user]);

  const bidAvailable = selectedProduct?.bid_allowed === true;
  const isBid = mode === 'bid' && bidAvailable;
  const offerNum = Number(offer);

  // 하한가는 DB 의 단일 기준(bid_floor_price)에서 읽는다 — 아래 검증은 안내용이고 최종 판단은 DB 가 한다
  useEffect(() => {
    if (!productId || !bidAvailable) {
      setFloor(null);
      return;
    }
    let alive = true;
    void supabase.rpc('bid_floor_price', { p_product_id: productId }).then(({ data }) => {
      if (alive) setFloor(typeof data === 'number' ? data : null);
    });
    return () => {
      alive = false;
    };
  }, [supabase, productId, bidAvailable]);

  const offerOk = !isBid || (Number.isInteger(offerNum) && offerNum > 0 && (floor === null || offerNum >= floor));

  const canSubmit =
    !submitting && !submitted && categoryId !== '' && productId !== '' && address.trim() !== '' && scheduledAt !== '' && phone.trim() !== '' &&
    (!isBid || (offer !== '' && offerOk));

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setError(null);
    setSubmitted(true);
    try {
      // 연락처는 계정에 저장한다 (배정 후 상대방에게 order_contact 로만 공개된다)
      if (user) {
        const { error: phoneErr } = await supabase.from('users').update({ phone: phone.trim() }).eq('uid', user.uid);
        if (phoneErr) throw new Error(phoneErr.message);
      }
      const order = await createOrder({
        category_id: categoryId,
        product_id: productId,
        order_type: isBid ? 'customer_bid' : 'fixed',
        offered_price: isBid ? offerNum : undefined,
        address: address.trim(),
        scheduled_at: new Date(scheduledAt).toISOString(),
        note: note.trim(),
      });
      onSuccess(order);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitted(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 카테고리 */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
          {L(locale, '서비스 분야', 'Lĩnh vực dịch vụ', 'Service Category')}
        </label>
        <select
          value={categoryId}
          onChange={(e) => { setCategoryId(e.target.value); setProductId(''); }}
          className="w-full rounded-xl border px-4 py-3 text-sm outline-none"
          style={FIELD_STYLE}
        >
          <option value="">{L(locale, '-- 선택해주세요 --', '-- Chọn lĩnh vực --', '-- Select category --')}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.icon} {localizedName(c, locale)}</option>
          ))}
        </select>
      </div>

      {/* 상품 (고정가) */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
          {L(locale, '서비스 항목', 'Hạng mục dịch vụ', 'Service Item')}
        </label>
        <select
          value={productId}
          onChange={(e) => { setProductId(e.target.value); setMode('fixed'); setOffer(''); }}
          disabled={categoryId === ''}
          className="w-full rounded-xl border px-4 py-3 text-sm outline-none disabled:opacity-50"
          style={FIELD_STYLE}
        >
          <option value="">
            {categoryId === ''
              ? L(locale, '먼저 분야를 선택하세요', 'Hãy chọn lĩnh vực trước', 'Select a category first')
              : categoryProducts.length === 0
                ? L(locale, '고정가 항목이 없습니다 — 견적 요청을 이용하세요', 'Chưa có giá cố định — hãy yêu cầu báo giá', 'No fixed-price items — use a quote request')
                : L(locale, '-- 선택해주세요 --', '-- Chọn hạng mục --', '-- Select item --')}
          </option>
          {categoryProducts.map((p) => (
            <option key={p.id} value={p.id}>
              {localizedName(p, locale)} · {formatVND(p.base_price)}
            </option>
          ))}
        </select>
        {selectedProduct && (
          <p className="mt-1.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {selectedProduct.description}
          </p>
        )}
      </div>

      {/* 가격 방식: 단순 작업에서만 희망가 제시를 허용한다 */}
      {bidAvailable && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2" role="radiogroup">
            {([
              ['fixed', L(locale, '정찰가로 예약', 'Đặt giá cố định', 'Fixed price')],
              ['bid', L(locale, '희망가 제시', 'Đề xuất giá', 'Name your price')],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={mode === key}
                onClick={() => setMode(key)}
                className="rounded-xl border px-3 py-2.5 text-sm font-bold transition-colors"
                style={
                  mode === key
                    ? { background: 'var(--color-primary)', borderColor: 'var(--color-primary)', color: '#fff' }
                    : FIELD_STYLE
                }
              >
                {label}
              </button>
            ))}
          </div>

          {isBid && (
            <div>
              <input
                type="number"
                inputMode="numeric"
                min={floor ?? 1}
                step={1000}
                value={offer}
                onChange={(e) => setOffer(e.target.value)}
                placeholder={L(locale, '희망 금액 (VND)', 'Số tiền mong muốn (VND)', 'Your price (VND)')}
                aria-invalid={offer !== '' && !offerOk}
                className="w-full rounded-xl border px-4 py-3 text-sm outline-none"
                style={FIELD_STYLE}
              />
              <p className="mt-1.5 text-xs" style={{ color: offer !== '' && !offerOk ? '#D32F2F' : 'var(--color-text-muted)' }}>
                {floor !== null
                  ? L(locale,
                      `최소 ${formatVND(floor)} 이상부터 제시할 수 있어요. 너무 낮으면 기술자가 수락하지 않을 수 있습니다.`,
                      `Tối thiểu ${formatVND(floor)}. Giá quá thấp có thể không có kỹ thuật viên nhận.`,
                      `Minimum ${formatVND(floor)}. Very low offers may not get accepted.`)
                  : L(locale, '먼저 수락한 기술자가 이 금액으로 배정됩니다.', 'Kỹ thuật viên nhận đơn trước sẽ được phân công với mức giá này.', 'The first technician to accept is assigned at this price.')}
              </p>
            </div>
          )}
        </div>
      )}

      {/* 주소 */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
          {L(locale, '방문 주소', 'Địa chỉ', 'Address')}
        </label>
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder={L(locale, '예: 하노이 미딩 OO아파트 101동 1001호', 'VD: Mỹ Đình, Hà Nội, tòa A, căn 1001', 'e.g. My Dinh, Hanoi, Bldg A, Apt 1001')}
          className="w-full rounded-xl border px-4 py-3 text-sm outline-none"
          style={FIELD_STYLE}
        />
      </div>

      {/* 연락처 */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
          {L(locale, '연락처 (잘로·전화)', 'Số điện thoại (Zalo/gọi)', 'Phone (Zalo / call)')}
        </label>
        <input
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="09xx xxx xxx"
          className="w-full rounded-xl border px-4 py-3 text-sm outline-none"
          style={FIELD_STYLE}
        />
        <p className="mt-1 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          {L(locale, '기술자가 배정된 뒤에만 상대방에게 공개됩니다.', 'Chỉ hiển thị cho kỹ thuật viên sau khi được phân công.', 'Shared with the technician only after assignment.')}
        </p>
      </div>

      {/* 일시 */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
          {L(locale, '방문 희망 일시', 'Ngày & giờ mong muốn', 'Preferred Date & Time')}
        </label>
        <input
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
          className="w-full rounded-xl border px-4 py-3 text-sm outline-none"
          style={FIELD_STYLE}
        />
      </div>

      {/* 메모 */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
          {L(locale, '요청 사항', 'Yêu cầu chi tiết', 'Details')}
        </label>
        <textarea
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={L(locale, '상세 내용 (증상, 특이사항 등)', 'Mô tả chi tiết (triệu chứng, ghi chú…)', 'Describe the issue (symptoms, notes…)')}
          className="w-full rounded-xl border px-4 py-3 text-sm outline-none resize-none"
          style={FIELD_STYLE}
        />
      </div>

      {/* 금액 요약 */}
      {selectedProduct && (
        <div className="rounded-xl p-4 flex items-baseline justify-between" style={{ background: 'var(--color-primary-bg, #FFEBEE)' }}>
          <span className="text-xs font-semibold" style={{ color: 'var(--color-text-2)' }}>
            {L(locale, '예상 결제 금액', 'Số tiền dự kiến', 'Estimated total')}
          </span>
          <span className="text-lg font-extrabold" style={{ color: 'var(--color-primary)' }}>
            {formatVND(isBid && offerOk && offer !== '' ? offerNum : selectedProduct.base_price)}
          </span>
        </div>
      )}

      {error && (
        <p className="text-xs font-semibold" style={{ color: '#D32F2F' }}>{error}</p>
      )}

      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full rounded-2xl py-3.5 text-sm font-extrabold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        style={{ background: 'var(--color-primary)' }}
      >
        {submitting || submitted
          ? L(locale, '처리 중…', 'Đang xử lý…', 'Processing…')
          : L(locale, '주문하고 결제하기 →', 'Đặt & thanh toán →', 'Order & Pay →')}
      </button>
    </div>
  );
}
