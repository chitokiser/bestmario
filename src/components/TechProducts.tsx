'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSupabase } from '@/hooks/useSupabase';
import { formatVND, localizedName } from '@/lib/format';
import type { MarketProduct, ServiceCategory } from '@/types/supabase';

/** 기술자가 직접 올린 상품(이름·단가) 모음. 누르면 상품 페이지에서 수량을 정해 주문한다. */
export default function TechProducts({ locale }: { locale: string }) {
  const supabase = useSupabase();
  const [rows, setRows] = useState<MarketProduct[] | null>(null);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);

  const t = (ko: string, vi: string, en: string) =>
    locale === 'vi' ? vi : locale === 'en' ? en : ko;

  useEffect(() => {
    let alive = true;
    void Promise.all([
      supabase.rpc('marketplace_products', { p_category: null, p_limit: 12 }),
      supabase.from('service_categories').select('*'),
    ]).then(([prods, cats]) => {
      if (!alive) return;
      setRows(prods.error ? [] : ((prods.data ?? []) as MarketProduct[]));
      setCategories((cats.data ?? []) as ServiceCategory[]);
    });
    return () => {
      alive = false;
    };
  }, [supabase]);

  const prefix = locale === 'vi' ? '' : `/${locale}`;
  const cat = (id: string) => categories.find((c) => c.id === id);

  return (
    <section id="tech-products" className="px-4 pb-8" aria-labelledby="tech-products-title">
      <h2 id="tech-products-title" className="mb-1 text-lg font-extrabold" style={{ color: 'var(--color-text)' }}>
        🛍️ {t('기술자 상품', 'Sản phẩm kỹ thuật viên', 'Technician products')}
      </h2>
      <p className="mb-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        {t('전문가가 직접 정한 가격으로 바로 주문하세요.', 'Đặt ngay với mức giá do chuyên gia tự đặt.', 'Order right away at prices set by the professionals.')}
      </p>

      {rows === null ? (
        <div className="h-28 animate-pulse rounded-2xl" style={{ background: 'var(--color-border)' }} aria-hidden />
      ) : rows.length === 0 ? (
        <p
          className="rounded-2xl border px-4 py-6 text-center text-xs"
          style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
        >
          {t('곧 전문가들의 상품이 올라와요.', 'Sản phẩm của chuyên gia sắp ra mắt.', 'Professionals’ products are coming soon.')}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {rows.map((p) => {
            const c = cat(p.category_id);
            return (
              <li key={p.id}>
                <Link
                  href={`${prefix}/shop/${p.id}`}
                  className="block h-full rounded-2xl border p-4 transition-transform active:scale-[0.99]"
                  style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
                >
                  <p className="text-[11px] font-semibold" style={{ color: 'var(--color-text-muted)' }}>
                    {c ? `${c.icon} ${localizedName(c, locale)}` : ''}
                  </p>
                  <p className="mt-0.5 text-sm font-bold" style={{ color: 'var(--color-text)' }}>{p.name}</p>
                  <p className="mt-1 text-base font-extrabold" style={{ color: 'var(--color-primary)' }}>
                    {formatVND(p.unit_price)}
                    <span className="text-xs font-semibold" style={{ color: 'var(--color-text-muted)' }}> / {p.unit_label}</span>
                  </p>
                  <p className="mt-1.5 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                    {p.tech_name}
                    {p.tech_reviews > 0 ? ` · ⭐ ${Number(p.tech_rating).toFixed(1)} (${p.tech_reviews})` : ''}
                    {p.tech_done > 0 ? ` · ${t('완료', 'Hoàn thành', 'Done')} ${p.tech_done}` : ''}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
