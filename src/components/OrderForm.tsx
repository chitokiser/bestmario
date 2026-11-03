'use client';

import { useMemo, useState } from 'react';
import { useOrders } from '@/hooks/useOrders';
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

  const [categoryId, setCategoryId] = useState('');
  const [productId, setProductId] = useState('');
  const [address, setAddress] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const categoryProducts = useMemo(
    () => products.filter((p) => p.category_id === categoryId),
    [products, categoryId]
  );

  const selectedProduct = categoryProducts.find((p) => p.id === productId) ?? null;

  const canSubmit =
    !submitting && categoryId !== '' && productId !== '' && address.trim() !== '' && scheduledAt !== '';

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setError(null);
    try {
      const order = await createOrder({
        category_id: categoryId,
        product_id: productId,
        order_type: 'fixed',
        address: address.trim(),
        scheduled_at: new Date(scheduledAt).toISOString(),
        note: note.trim(),
      });
      onSuccess(order);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
          onChange={(e) => setProductId(e.target.value)}
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
            {formatVND(selectedProduct.base_price)}
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
        {submitting
          ? L(locale, '처리 중…', 'Đang xử lý…', 'Processing…')
          : L(locale, '주문하고 결제하기 →', 'Đặt & thanh toán →', 'Order & Pay →')}
      </button>
    </div>
  );
}
