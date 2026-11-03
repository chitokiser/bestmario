'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter, usePathname } from 'next/navigation';
import { signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { auth, callMerchantMemberJoin } from '@/lib/firebase';
import { useUTM } from '@/hooks/useUTM';
import { useMerchant } from '@/hooks/useMerchant';
import { useServiceProducts } from '@/hooks/useServiceProducts';
import { useWebzines } from '@/hooks/useWebzines';
import { useAuthState } from '@/hooks/useAuthState';

const MERCHANT_ID = process.env.NEXT_PUBLIC_BESTMARIO_MERCHANT_ID || undefined;

const LOCALES = [
  { code: 'vi', label: 'VI' },
  { code: 'ko', label: 'KO' },
  { code: 'en', label: 'EN' },
];

const CATEGORY_ICONS: Record<string, string> = {
  electrical: '⚡',
  plumbing: '🔧',
  aircon: '❄️',
  carpentry: '🪚',
  painting: '🎨',
  cleaning: '🧹',
  appliance: '🔌',
  default: '🛠️',
};

function formatVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(amount) + '₫';
}

function WalletChip({ icon, value, label }: { icon: string; value: number; label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold"
      style={{ background: 'rgba(255,255,255,0.15)' }}
      aria-label={`${label}: ${value}`}
    >
      {icon} {new Intl.NumberFormat().format(value)}
    </span>
  );
}

function ServiceCardSkeleton() {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50 animate-pulse h-48" aria-hidden />
  );
}

function ServiceCard({
  name,
  description,
  price,
  currency,
  category,
  onRequest,
}: {
  name: string;
  description?: string;
  price: number;
  currency?: string;
  category?: string;
  onRequest: () => void;
}) {
  const t = useTranslations('home');
  const icon = CATEGORY_ICONS[category ?? ''] ?? CATEGORY_ICONS.default;
  const priceStr = currency === 'VND' || !currency ? formatVND(price) : `${price} ${currency}`;

  return (
    <article className="rounded-2xl border border-gray-100 bg-white shadow-sm hover:shadow-md transition-shadow p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <span className="text-3xl">{icon}</span>
        <span className="text-base font-bold" style={{ color: 'var(--color-primary)' }}>
          {priceStr}
        </span>
      </div>
      <h3 className="font-semibold text-gray-900 text-sm leading-snug">{name}</h3>
      {description && (
        <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">{description}</p>
      )}
      <button
        onClick={onRequest}
        className="mt-auto w-full py-2 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 active:opacity-75"
        style={{ background: 'var(--color-primary)' }}
      >
        {t('cta_request')}
      </button>
    </article>
  );
}

export default function LandingClient({ locale }: { locale: string }) {
  const t = useTranslations('home');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();

  useUTM();

  const [joinLoading, setJoinLoading] = useState(false);

  const { user, wallets, authLoading } = useAuthState();
  const { merchant, loading: merchantLoading } = useMerchant(MERCHANT_ID);
  const { products, loading: productsLoading } = useServiceProducts(MERCHANT_ID);
  const { webzines, loading: webzinesLoading } = useWebzines(MERCHANT_ID, 3);

  const handleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, new GoogleAuthProvider());
      if (MERCHANT_ID && result.user) {
        setJoinLoading(true);
        try {
          await callMerchantMemberJoin(MERCHANT_ID);
        } catch {
          // 멘토 지정 실패 — 사용자는 정상 로그인됨, 백그라운드 오류 무시
        } finally {
          setJoinLoading(false);
        }
      }
    } catch {
      // 팝업 닫음 또는 로그인 취소 — 무시
    }
  };

  const handleLogout = () => signOut(auth);

  const handleSwitchLocale = (newLocale: string) => {
    const segments = pathname.split('/');
    const knownLocales = ['ko', 'en', 'vi'];
    if (knownLocales.includes(segments[1])) {
      segments[1] = newLocale === 'vi' ? '' : newLocale;
    } else {
      if (newLocale !== 'vi') segments.splice(1, 0, newLocale);
    }
    const newPath = segments.filter(Boolean).join('/') || '/';
    router.push('/' + newPath.replace(/^\//, ''));
  };

  const handleRequestService = () => {
    // M3+ feature: redirect to booking flow or scroll to CTA
    const el = document.getElementById('services');
    el?.scrollIntoView({ behavior: 'smooth' });
  };

  const btStock = merchant?.btBalance ?? 0;
  const btPerVnd = merchant?.btPerVnd;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--color-bg)' }}>
      {/* ── Header ── */}
      <header
        className="sticky top-0 z-40 flex items-center justify-between px-4 py-3 gap-2"
        style={{ background: 'var(--color-primary)' }}
      >
        <a href="#" className="text-white font-extrabold text-lg tracking-tight">
          BestMario
        </a>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Wallet chips (show only when logged in) */}
          {user && wallets && (
            <div className="flex gap-1 flex-wrap">
              <WalletChip icon="💎" value={wallets.pointBalanceVnd} label="BM" />
              <WalletChip icon="🎟️" value={wallets.btBalance} label="BT" />
              <WalletChip icon="⭐" value={wallets.pointBalance} label="Point" />
            </div>
          )}

          {/* Auth button */}
          {!authLoading && (
            <button
              onClick={user ? handleLogout : handleLogin}
              disabled={joinLoading}
              className="text-xs font-semibold text-white underline-offset-2 hover:underline whitespace-nowrap disabled:opacity-60"
            >
              {joinLoading ? tCommon('join_processing') : user ? tCommon('logout') : tCommon('login')}
            </button>
          )}

          {/* Locale switcher */}
          <div className="flex gap-1">
            {LOCALES.map((l) => (
              <button
                key={l.code}
                onClick={() => handleSwitchLocale(l.code)}
                aria-current={locale === l.code ? 'true' : undefined}
                className={`text-xs font-bold px-1.5 py-0.5 rounded transition-colors ${
                  locale === l.code
                    ? 'bg-white text-red-600'
                    : 'text-white hover:bg-white/20'
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section
        className="relative flex flex-col items-center justify-center text-center px-6 py-16 gap-4"
        style={{
          background: 'linear-gradient(160deg, #E53935 0%, #B71C1C 100%)',
          minHeight: '55vw',
          maxHeight: '500px',
        }}
      >
        {/* Merchant name or BestMario default */}
        <h1 className="text-4xl font-extrabold text-white tracking-tight drop-shadow-sm">
          {merchantLoading ? 'BestMario' : (merchant?.name ?? 'BestMario')}
        </h1>
        <p className="text-white/90 text-base max-w-xs leading-relaxed">
          {t('tagline')}
        </p>

        {/* BT reward badge */}
        {btPerVnd ? (
          <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-full px-4 py-2 text-white text-sm font-semibold">
            🎟️ {formatVND(btPerVnd)} {t('bt_per_vnd')} · {t('bt_stock')}: {btStock.toLocaleString()}
          </div>
        ) : (
          <div className="inline-flex items-center gap-2 bg-white/15 rounded-full px-4 py-2 text-white/80 text-sm">
            🎟️ {t('bt_policy')}
          </div>
        )}

        {/* CTA buttons */}
        <div className="flex gap-3 mt-2 flex-wrap justify-center">
          <button
            onClick={handleRequestService}
            className="px-6 py-3 rounded-xl bg-white font-bold text-red-600 text-sm shadow-lg hover:shadow-xl active:scale-95 transition-all"
          >
            {t('cta_request')}
          </button>
          <button
            onClick={handleRequestService}
            className="px-6 py-3 rounded-xl border-2 border-white text-white font-bold text-sm hover:bg-white/10 active:scale-95 transition-all"
          >
            {t('cta_quote')}
          </button>
        </div>
      </section>

      {/* ── Trust badges ── */}
      <section className="px-4 py-6 flex justify-center">
        <div className="grid grid-cols-3 gap-3 w-full max-w-sm">
          {[
            { icon: '✅', label: t('trust_verified') },
            { icon: '🛡️', label: t('trust_warranty') },
            { icon: '💬', label: t('trust_multilang') },
          ].map(({ icon, label }) => (
            <div
              key={label}
              className="flex flex-col items-center gap-1 p-3 rounded-xl bg-gray-50 text-center"
            >
              <span className="text-2xl">{icon}</span>
              <span className="text-xs text-gray-600 font-medium leading-tight">{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Service menu ── */}
      <section id="services" className="px-4 pb-8">
        <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--color-text)' }}>
          {t('services_title')}
        </h2>

        {!MERCHANT_ID ? (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-700">
            ⚙️ {t('services_pending_setup')}
          </div>
        ) : productsLoading ? (
          <div className="grid grid-cols-2 gap-3">
            {[...Array(4)].map((_, i) => <ServiceCardSkeleton key={i} />)}
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">{tCommon('no_items')}</div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {products.map((p) => (
              <ServiceCard
                key={p.id}
                name={p.name}
                description={p.description}
                price={p.price}
                currency={p.currency}
                category={p.service_category}
                onRequest={handleRequestService}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── BT Policy section ── */}
      <section className="mx-4 mb-8 rounded-2xl p-5" style={{ background: '#FFF8E1' }}>
        <h2 className="font-bold text-sm text-amber-900 mb-2">🎟️ {t('bt_policy')}</h2>
        <p className="text-xs text-amber-800 leading-relaxed">
          {t('bt_description')}
        </p>
        {btPerVnd ? (
          <p className="mt-2 text-xs font-bold text-amber-900">
            {formatVND(btPerVnd)} = 1 BT · {t('bt_stock')}: {btStock.toLocaleString()}
          </p>
        ) : null}
      </section>

      {/* ── BestClub join CTA ── */}
      {!user && (
        <section
          className="mx-4 mb-8 rounded-2xl p-6 text-center"
          style={{ background: 'var(--color-primary)' }}
        >
          <h2 className="font-bold text-white text-base mb-1">{t('join_title')}</h2>
          <p className="text-white/80 text-xs mb-4">{t('join_subtitle')}</p>
          <button
            onClick={handleLogin}
            className="px-6 py-2.5 rounded-xl bg-white font-bold text-red-600 text-sm hover:shadow-lg transition-shadow"
          >
            {tCommon('login')}
          </button>
        </section>
      )}

      {/* ── Webzine widget ── */}
      {!webzinesLoading && webzines.length > 0 && (
        <section className="px-4 pb-8">
          <h2 className="text-base font-bold mb-3" style={{ color: 'var(--color-text)' }}>
            {t('webzine_title')}
          </h2>
          <div className="flex flex-col gap-3">
            {webzines.map((w) => (
              <article
                key={w.id}
                className="rounded-xl border border-gray-100 bg-white p-4 flex gap-3 items-start"
              >
                {w.thumbnail_url && (
                  <img
                    src={w.thumbnail_url}
                    alt=""
                    width={64}
                    height={64}
                    loading="lazy"
                    decoding="async"
                    className="w-16 h-16 object-cover rounded-lg flex-shrink-0 bg-gray-100"
                  />
                )}
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-gray-900 line-clamp-2">{w.title}</h3>
                  {w.summary && (
                    <p className="mt-1 text-xs text-gray-500 line-clamp-2">{w.summary}</p>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* ── Area landing links ── */}
      <section className="px-4 pb-8">
        <h2 className="text-sm font-bold mb-3 text-gray-500 uppercase tracking-wide">
          {t('area_title')}
        </h2>
        <div className="flex flex-wrap gap-2">
          {[
            { slug: 'my-dinh', label: 'Mỹ Đình' },
            { slug: 'keangnam-trung-hoa', label: 'Keangnam / Trung Hòa' },
            { slug: 'tay-ho', label: 'Tây Hồ' },
            { slug: 'cau-giay', label: 'Cầu Giấy' },
          ].map(({ slug, label }) => (
            <a
              key={slug}
              href={`/${locale}/area/${slug}`}
              className="px-3 py-1.5 rounded-full border border-gray-200 text-xs text-gray-600 hover:border-red-300 hover:text-red-600 transition-colors"
            >
              📍 {label}
            </a>
          ))}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="mt-auto px-4 py-8 text-center border-t border-gray-100">
        <p className="text-xs text-gray-400">
          BestMario — BestClub Franchise Channel
          <br />
          Hà Nội, Vietnam · {t('tagline')}
        </p>
      </footer>
    </div>
  );
}
