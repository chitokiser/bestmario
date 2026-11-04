'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSupabase } from '@/hooks/useSupabase';
import { useAuthState } from '@/hooks/useAuthState';
import { useLogin } from '@/hooks/useLogin';
import { formatVND, localizedName } from '@/lib/format';
import type { MarketProduct, ServiceCategory } from '@/types/supabase';

const CARD = { background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #ebebed)' } as const;
const FIELD = {
  background: 'var(--color-bg, #f7f7f8)',
  borderColor: 'var(--color-border, #ebebed)',
  color: 'var(--color-text)',
} as const;
const LABEL = 'block text-xs font-semibold uppercase tracking-wide mb-1.5';

export default function ShopProductPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = use(params);
  const router = useRouter();
  const supabase = useSupabase();
  const { user, authLoading } = useAuthState();
  const { login, joinLoading } = useLogin(locale);

  const t = (ko: string, vi: string, en: string) =>
    locale === 'vi' ? vi : locale === 'en' ? en : ko;

  const [product, setProduct] = useState<MarketProduct | null>(null);
  const [category, setCategory] = useState<ServiceCategory | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [qty, setQty] = useState('');
  const [address, setAddress] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void supabase.rpc('marketplace_product', { p_id: id }).then(async ({ data }) => {
      if (!alive) return;
      const p = ((data ?? [])[0] ?? null) as MarketProduct | null;
      setProduct(p);
      if (p) {
        setQty((prev) => prev || String(p.min_qty));
        const { data: c } = await supabase.from('service_categories').select('*').eq('id', p.category_id).maybeSingle();
        if (alive) setCategory((c ?? null) as ServiceCategory | null);
      }
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [supabase, id]);

  // 계정에 저장된 연락처가 있으면 채워 둔다
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

  const back = () => router.push(locale === 'vi' ? '/#tech-products' : `/${locale}#tech-products`);

  const shell = (children: React.ReactNode) => (
    <main className="min-h-screen px-4 py-6" style={{ background: 'var(--color-bg)' }}>
      <div className="mx-auto w-full max-w-lg space-y-4">
        <button onClick={back} className="text-xs font-semibold" style={{ color: 'var(--color-text-muted)' }}>
          ← {t('기술자 상품', 'Sản phẩm kỹ thuật viên', 'Technician products')}
        </button>
        {children}
      </div>
    </main>
  );

  if (!loaded) {
    return shell(<p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{t('불러오는 중…', 'Đang tải…', 'Loading…')}</p>);
  }
  if (!product) {
    return shell(
      <div className="rounded-2xl border p-6 text-center" style={CARD}>
        <p className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>
          {t('판매 중인 상품이 아닙니다', 'Sản phẩm không còn được bán', 'This product is not available')}
        </p>
      </div>
    );
  }

  const qtyNum = Number(qty);
  const qtyOk = Number.isInteger(qtyNum) && qtyNum >= product.min_qty && qtyNum <= 10000;
  const total = qtyOk ? qtyNum * product.unit_price : 0;
  const canSubmit = !!user && !busy && qtyOk && address.trim() !== '' && scheduledAt !== '' && phone.trim() !== '';

  const order = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('order_tech_product', {
      p_product_id: product.id,
      p_quantity: qtyNum,
      p_address: address.trim(),
      p_scheduled_at: new Date(scheduledAt).toISOString(),
      p_note: note.trim(),
      p_phone: phone.trim(),
    });
    if (err || !data) {
      setError(err?.message ?? t('주문에 실패했습니다', 'Đặt hàng thất bại', 'Order failed'));
      setBusy(false);
      return;
    }
    router.push(`/${locale}/payment/${data as string}`);
  };

  return shell(
    <>
      <section className="rounded-2xl border p-5" style={CARD}>
        <p className="text-[11px] font-semibold" style={{ color: 'var(--color-text-muted)' }}>
          {category ? `${category.icon} ${localizedName(category, locale)}` : ''}
        </p>
        <h1 className="mt-0.5 text-lg font-extrabold" style={{ color: 'var(--color-text)' }}>{product.name}</h1>
        <p className="mt-1 text-xl font-extrabold" style={{ color: 'var(--color-primary)' }}>
          {formatVND(product.unit_price)}
          <span className="text-sm font-semibold" style={{ color: 'var(--color-text-muted)' }}> / {product.unit_label}</span>
        </p>
        <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {t('최소 주문', 'Tối thiểu', 'Minimum')} {product.min_qty}{product.unit_label}
        </p>
        {product.description && (
          <p className="mt-3 whitespace-pre-wrap border-t pt-3 text-sm" style={{ borderColor: 'var(--color-border, #ebebed)', color: 'var(--color-text)' }}>
            {product.description}
          </p>
        )}
        <p className="mt-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          👤 {product.tech_name}
          {product.tech_reviews > 0 ? ` · ⭐ ${Number(product.tech_rating).toFixed(1)} (${product.tech_reviews})` : ` · ${t('아직 리뷰 없음', 'Chưa có đánh giá', 'No reviews yet')}`}
          {product.tech_done > 0 ? ` · ${t('완료', 'Hoàn thành', 'Done')} ${product.tech_done}` : ''}
        </p>
      </section>

      {!authLoading && !user ? (
        <section className="rounded-2xl border p-5 text-center" style={CARD}>
          <p className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>{t('주문하려면 로그인이 필요합니다', 'Cần đăng nhập để đặt hàng', 'Log in to order')}</p>
          <button
            onClick={() => void login()}
            disabled={joinLoading}
            className="mt-3 rounded-xl px-6 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            style={{ background: 'var(--color-primary)' }}
          >
            {t('로그인', 'Đăng nhập', 'Log in')}
          </button>
        </section>
      ) : (
        <section className="space-y-3 rounded-2xl border p-5" style={CARD}>
          <div>
            <label className={LABEL} style={{ color: 'var(--color-text-muted)' }}>
              {t('수량', 'Số lượng', 'Quantity')} ({product.unit_label})
            </label>
            <input
              type="number"
              inputMode="numeric"
              min={product.min_qty}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              aria-invalid={qty !== '' && !qtyOk}
              className="w-full rounded-xl border px-4 py-3 text-sm outline-none"
              style={FIELD}
            />
            {qty !== '' && !qtyOk && (
              <p className="mt-1 text-[11px]" style={{ color: '#D32F2F' }}>
                {t(`최소 ${product.min_qty}${product.unit_label} 이상 입력해 주세요.`, `Tối thiểu ${product.min_qty}${product.unit_label}.`, `Minimum ${product.min_qty}${product.unit_label}.`)}
              </p>
            )}
          </div>
          <div>
            <label className={LABEL} style={{ color: 'var(--color-text-muted)' }}>{t('작업(방문) 주소', 'Địa chỉ', 'Address')}</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} className="w-full rounded-xl border px-4 py-3 text-sm outline-none" style={FIELD} />
          </div>
          <div>
            <label className={LABEL} style={{ color: 'var(--color-text-muted)' }}>{t('희망 일시', 'Ngày giờ mong muốn', 'Preferred date & time')}</label>
            <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="w-full rounded-xl border px-4 py-3 text-sm outline-none" style={FIELD} />
          </div>
          <div>
            <label className={LABEL} style={{ color: 'var(--color-text-muted)' }}>{t('연락처 (잘로·전화)', 'Số điện thoại (Zalo/gọi)', 'Phone (Zalo / call)')}</label>
            <input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09xx xxx xxx" className="w-full rounded-xl border px-4 py-3 text-sm outline-none" style={FIELD} />
          </div>
          <div>
            <label className={LABEL} style={{ color: 'var(--color-text-muted)' }}>{t('요청 사항', 'Yêu cầu', 'Details')}</label>
            <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} className="w-full resize-none rounded-xl border px-4 py-3 text-sm outline-none" style={FIELD} />
          </div>

          <div className="flex items-baseline justify-between rounded-xl p-4" style={{ background: 'var(--color-primary-bg, #FFEBEE)' }}>
            <span className="text-xs font-semibold" style={{ color: 'var(--color-text-2)' }}>
              {t('결제 금액', 'Thành tiền', 'Total')}
              {qtyOk ? ` (${qtyNum}${product.unit_label} × ${formatVND(product.unit_price)})` : ''}
            </span>
            <span className="text-lg font-extrabold" style={{ color: 'var(--color-primary)' }}>{qtyOk ? formatVND(total) : '–'}</span>
          </div>

          {error && <p className="text-xs font-semibold" style={{ color: '#D32F2F' }} role="alert">{error}</p>}

          <button
            onClick={() => void order()}
            disabled={!canSubmit}
            className="w-full rounded-2xl py-3.5 text-sm font-extrabold text-white disabled:opacity-50"
            style={{ background: 'var(--color-primary)' }}
          >
            {busy ? t('처리 중…', 'Đang xử lý…', 'Processing…') : t('주문하고 결제하기 →', 'Đặt & thanh toán →', 'Order & Pay →')}
          </button>
        </section>
      )}
    </>
  );
}
