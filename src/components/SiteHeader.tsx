'use client';

import Image from 'next/image';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuthState } from '@/hooks/useAuthState';
import { useLogin } from '@/hooks/useLogin';
import { useSyncEmail } from '@/hooks/useSyncEmail';

const LOCALES = [
  { code: 'vi', label: 'VI' },
  { code: 'ko', label: 'KO' },
  { code: 'en', label: 'EN' },
];

const NAV_BTN =
  'whitespace-nowrap rounded-full px-2 py-1 text-[13px] font-bold text-white/90 transition-colors hover:bg-white/15 hover:text-white active:scale-95';

/** 모든 화면 상단에 고정되는 메뉴. 한 줄(52px)로 유지한다. */
export default function SiteHeader({ locale }: { locale: string }) {
  const tCommon = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const { user, authLoading } = useAuthState();
  const { login, joinLoading } = useLogin(locale);
  useSyncEmail();

  const homePath = locale === 'vi' ? '/' : `/${locale}`;

  const goServices = () => {
    const el = document.getElementById('services');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
    else router.push(`${homePath === '/' ? '' : homePath}/#services`);
  };

  const switchLocale = (newLocale: string) => {
    const segments = pathname.split('/');
    if (['ko', 'en', 'vi'].includes(segments[1])) {
      segments[1] = newLocale === 'vi' ? '' : newLocale;
    } else if (newLocale !== 'vi') {
      segments.splice(1, 0, newLocale);
    }
    const next = segments.filter(Boolean).join('/');
    router.push('/' + next);
  };

  return (
    <header
      className="sticky top-0 z-50 flex h-[52px] items-center gap-2 px-4"
      style={{ background: 'var(--color-primary)' }}
    >
      {/* 로고는 흰 배경용이라 빨간 헤더 위에서는 흰 판에 올린다 */}
      <a href={homePath} className="flex shrink-0 items-center rounded-lg bg-white px-2 py-1 shadow-sm">
        <Image
          src="/bestmario-logo.webp"
          alt="BestMario"
          width={480}
          height={155}
          priority
          className="h-6 w-auto"
        />
      </a>

      <nav aria-label="main" className="flex min-w-0 items-center gap-0.5">
        <button
          onClick={() => router.push(`/${locale}/ai-doctor`)}
          className={`${NAV_BTN} bg-white/20 text-yellow-200 hover:text-white flex items-center gap-1`}
        >
          <span>🤖</span>
          <span>{locale === 'vi' ? 'AI Bác sĩ' : locale === 'en' ? 'AI Doctor' : 'AI 진단'}</span>
        </button>
        <button onClick={goServices} className={NAV_BTN}>
          {tCommon('nav_services')}
        </button>
        {user ? (
          <button onClick={() => router.push(`/${locale}/mypage`)} className={NAV_BTN}>
            {tCommon('nav_mypage')}
          </button>
        ) : (
          !authLoading && (
            <button onClick={login} disabled={joinLoading} className={`${NAV_BTN} disabled:opacity-60`}>
              {tCommon('login')}
            </button>
          )
        )}
      </nav>

      <div className="ml-auto flex shrink-0 gap-1">
        {LOCALES.map((l) => (
          <button
            key={l.code}
            onClick={() => switchLocale(l.code)}
            aria-current={locale === l.code ? 'true' : undefined}
            className={`rounded px-1.5 py-0.5 text-xs font-bold transition-colors ${
              locale === l.code ? 'bg-white text-red-600' : 'text-white hover:bg-white/20'
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>
    </header>
  );
}
