'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import { useSupabase } from '@/hooks/useSupabase';
import { useAuthState } from '@/hooks/useAuthState';
import { formatVND, localizedName } from '@/lib/format';
import type { ServiceCategory, TechnicianProduct } from '@/types/supabase';

const CARD = { background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #ebebed)' } as const;
const FIELD = {
  background: 'var(--color-bg, #f7f7f8)',
  borderColor: 'var(--color-border, #ebebed)',
  color: 'var(--color-text)',
} as const;
const LABEL = 'block text-xs font-semibold uppercase tracking-wide mb-1.5';
const UNIT_PRESETS = ['㎡', '건', '대', '개', '시간', '일'];

const STATUS = {
  pending:  { color: '#E65100', bg: '#FFF3E0', ko: '심사 대기', vi: 'Chờ duyệt',   en: 'In review' },
  active:   { color: '#2E7D32', bg: '#E8F5E9', ko: '판매 중',   vi: 'Đang bán',    en: 'On sale' },
  rejected: { color: '#C62828', bg: '#FFEBEE', ko: '반려',      vi: 'Bị từ chối',  en: 'Rejected' },
  hidden:   { color: '#546E7A', bg: '#ECEFF1', ko: '숨김',      vi: 'Đã ẩn',       en: 'Hidden' },
} as const;

interface Draft {
  id: string | null;
  category: string;
  name: string;
  description: string;
  unit: string;
  price: string;
  minQty: string;
}
const EMPTY: Draft = { id: null, category: '', name: '', description: '', unit: '건', price: '', minQty: '1' };

export default function TechnicianProductsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  const supabase = useSupabase();
  const { user } = useAuthState();

  const t = (ko: string, vi: string, en: string) =>
    locale === 'vi' ? vi : locale === 'en' ? en : ko;

  const [products, setProducts] = useState<TechnicianProduct[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [skills, setSkills] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    const mine = ++seq.current;
    const [prods, cats, prof] = await Promise.all([
      supabase.from('technician_products').select('*').eq('technician_uid', user.uid).order('created_at', { ascending: false }),
      supabase.from('service_categories').select('*').order('id'),
      supabase.from('technician_profiles').select('skills').eq('uid', user.uid).maybeSingle(),
    ]);
    if (mine !== seq.current) return;
    setProducts((prods.data ?? []) as TechnicianProduct[]);
    setCategories((cats.data ?? []) as ServiceCategory[]);
    setSkills(((prof.data?.skills as string[] | undefined) ?? []));
    setLoading(false);
  }, [supabase, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const catLabel = (id: string) => {
    const c = categories.find((x) => x.id === id);
    return c ? `${c.icon} ${localizedName(c, locale)}` : id;
  };

  const startNew = () => {
    setError(null);
    setDraft({ ...EMPTY, category: skills[0] ?? '' });
  };
  const startEdit = (p: TechnicianProduct) => {
    setError(null);
    setDraft({
      id: p.id,
      category: p.category_id,
      name: p.name,
      description: p.description,
      unit: p.unit_label,
      price: String(p.unit_price),
      minQty: String(p.min_qty),
    });
  };

  const save = async () => {
    if (!draft || busy) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc('save_tech_product', {
      p_id: draft.id,
      p_category: draft.category,
      p_name: draft.name.trim(),
      p_description: draft.description.trim(),
      p_unit: draft.unit.trim(),
      p_unit_price: Number(draft.price),
      p_min_qty: Number(draft.minQty),
    });
    if (err) setError(err.message);
    else {
      setDraft(null);
      await load();
    }
    setBusy(false);
  };

  const toggleHidden = async (p: TechnicianProduct) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc('set_tech_product_hidden', { p_id: p.id, p_hidden: p.status === 'active' });
    if (err) setError(err.message);
    await load();
    setBusy(false);
  };

  if (loading) {
    return <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{t('불러오는 중…', 'Đang tải…', 'Loading…')}</p>;
  }

  const price = Number(draft?.price);
  const preview = draft && Number.isFinite(price) && price > 0 ? `${formatVND(price)} / ${draft.unit || '…'}` : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-base font-extrabold" style={{ color: 'var(--color-text)' }}>
          {t('내 상품', 'Sản phẩm của tôi', 'My products')} ({products.length})
        </h1>
        {!draft && (
          <button
            onClick={startNew}
            disabled={skills.length === 0}
            className="rounded-xl px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
            style={{ background: 'var(--color-primary)' }}
          >
            + {t('상품 등록', 'Thêm sản phẩm', 'Add product')}
          </button>
        )}
      </div>

      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        {t(
          '내 서비스의 이름과 단가를 직접 정해 올리면 관리자 심사 후 "기술자 상품"에 공개되고, 고객이 수량을 정해 바로 주문합니다. 승인된 기술분야에서만 등록할 수 있어요.',
          'Tự đặt tên và đơn giá dịch vụ; sau khi quản trị duyệt sẽ hiển thị trong "Sản phẩm kỹ thuật viên" và khách đặt theo số lượng. Chỉ đăng trong lĩnh vực đã được duyệt.',
          'Set your own service name and unit price. After admin review it appears under "Technician products" and customers order by quantity. Only in your approved skills.'
        )}
      </p>

      {error && <p className="text-xs font-semibold" style={{ color: '#D32F2F' }} role="alert">{error}</p>}

      {draft && (
        <section className="space-y-3 rounded-2xl border p-4" style={CARD}>
          <h2 className="text-sm font-extrabold" style={{ color: 'var(--color-text)' }}>
            {draft.id ? t('상품 수정', 'Sửa sản phẩm', 'Edit product') : t('새 상품', 'Sản phẩm mới', 'New product')}
          </h2>
          {draft.id && (
            <p className="text-[11px]" style={{ color: '#E65100' }}>
              {t('수정하면 다시 심사를 받아야 해요(승인 전까지 비공개).', 'Sửa sẽ phải duyệt lại (ẩn cho đến khi duyệt).', 'Editing requires a new review (hidden until approved).')}
            </p>
          )}
          <div>
            <label className={LABEL} style={{ color: 'var(--color-text-muted)' }}>{t('분야', 'Lĩnh vực', 'Category')}</label>
            <select
              value={draft.category}
              onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
              style={FIELD}
            >
              {skills.map((id) => (
                <option key={id} value={id}>{catLabel(id)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL} style={{ color: 'var(--color-text-muted)' }}>{t('상품명', 'Tên sản phẩm', 'Product name')}</label>
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              maxLength={80}
              placeholder={t('예) 2D CAD 인테리어 설계', 'VD: Thiết kế nội thất 2D CAD', 'e.g. 2D CAD interior design')}
              className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
              style={FIELD}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL} style={{ color: 'var(--color-text-muted)' }}>{t('단가 (VND)', 'Đơn giá (VND)', 'Unit price (VND)')}</label>
              <input
                type="number"
                inputMode="numeric"
                min={1000}
                step={1000}
                value={draft.price}
                onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                placeholder="10000"
                className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
                style={FIELD}
              />
            </div>
            <div>
              <label className={LABEL} style={{ color: 'var(--color-text-muted)' }}>{t('단위', 'Đơn vị', 'Unit')}</label>
              <input
                value={draft.unit}
                onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
                maxLength={10}
                className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
                style={FIELD}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {UNIT_PRESETS.map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setDraft({ ...draft, unit: u })}
                className="rounded-lg border px-2.5 py-1 text-xs font-semibold"
                style={draft.unit === u ? { background: 'var(--color-primary)', borderColor: 'var(--color-primary)', color: '#fff' } : FIELD}
              >
                {u}
              </button>
            ))}
          </div>
          <div>
            <label className={LABEL} style={{ color: 'var(--color-text-muted)' }}>{t('최소 주문 수량', 'Số lượng tối thiểu', 'Minimum quantity')}</label>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={draft.minQty}
              onChange={(e) => setDraft({ ...draft, minQty: e.target.value })}
              className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
              style={FIELD}
            />
          </div>
          <div>
            <label className={LABEL} style={{ color: 'var(--color-text-muted)' }}>{t('설명', 'Mô tả', 'Description')}</label>
            <textarea
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              maxLength={1000}
              rows={3}
              placeholder={t('포함 범위, 납품물, 소요 기간 등', 'Phạm vi, sản phẩm bàn giao, thời gian…', 'Scope, deliverables, turnaround…')}
              className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
              style={FIELD}
            />
          </div>
          {preview && (
            <p className="rounded-xl px-3 py-2 text-sm font-extrabold" style={{ background: 'var(--color-primary-bg, #FFEBEE)', color: 'var(--color-primary)' }}>
              {t('판매가', 'Giá bán', 'Price')}: {preview}
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => void save()}
              disabled={busy}
              className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-50"
              style={{ background: 'var(--color-primary)' }}
            >
              {busy ? t('저장 중…', 'Đang lưu…', 'Saving…') : draft.id ? t('수정 제출', 'Gửi bản sửa', 'Submit changes') : t('심사 요청', 'Gửi duyệt', 'Submit for review')}
            </button>
            <button
              onClick={() => setDraft(null)}
              className="rounded-xl border px-4 py-2.5 text-sm font-bold"
              style={{ borderColor: 'var(--color-border, #ebebed)', color: 'var(--color-text-muted)' }}
            >
              {t('취소', 'Hủy', 'Cancel')}
            </button>
          </div>
        </section>
      )}

      {products.length === 0 && !draft ? (
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {t('등록한 상품이 없습니다. 위의 "상품 등록"으로 시작해 보세요.', 'Chưa có sản phẩm. Bấm "Thêm sản phẩm" để bắt đầu.', 'No products yet. Tap "Add product" to start.')}
        </p>
      ) : (
        <ul className="space-y-3">
          {products.map((p) => {
            const s = STATUS[p.status];
            return (
              <li key={p.id} className="rounded-2xl border p-4" style={CARD}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>{p.name}</p>
                    <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{catLabel(p.category_id)}</p>
                  </div>
                  <span className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ color: s.color, background: s.bg }}>
                    {t(s.ko, s.vi, s.en)}
                  </span>
                </div>
                <p className="mt-1 text-base font-extrabold" style={{ color: 'var(--color-primary)' }}>
                  {formatVND(p.unit_price)} <span className="text-xs font-semibold" style={{ color: 'var(--color-text-muted)' }}>/ {p.unit_label}</span>
                  <span className="ml-2 text-[11px] font-semibold" style={{ color: 'var(--color-text-muted)' }}>
                    {t('최소', 'Tối thiểu', 'Min')} {p.min_qty}
                  </span>
                </p>
                {p.status === 'rejected' && p.reject_reason && (
                  <p className="mt-1 text-xs font-semibold" style={{ color: '#C62828' }}>
                    {t('반려 사유', 'Lý do', 'Reason')}: {p.reject_reason}
                  </p>
                )}
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => startEdit(p)}
                    className="flex-1 rounded-xl border py-2 text-xs font-bold"
                    style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}
                  >
                    {t('수정', 'Sửa', 'Edit')}
                  </button>
                  {(p.status === 'active' || (p.status === 'hidden' && p.approved_at)) && (
                    <button
                      onClick={() => void toggleHidden(p)}
                      disabled={busy}
                      className="flex-1 rounded-xl border py-2 text-xs font-bold disabled:opacity-50"
                      style={{ borderColor: 'var(--color-border, #ebebed)', color: 'var(--color-text-muted)' }}
                    >
                      {p.status === 'active' ? t('판매 중단', 'Ngừng bán', 'Hide') : t('다시 판매', 'Bán lại', 'Relist')}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
