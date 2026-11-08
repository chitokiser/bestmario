'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuthState } from '@/hooks/useAuthState';
import { useLogin } from '@/hooks/useLogin';
import { useSyncEmail } from '@/hooks/useSyncEmail';
import { useNotificationHub } from '@/hooks/useNotificationHub';
import NotificationModal from '@/components/NotificationModal';
import NotificationToast from '@/components/NotificationToast';

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

  const [showNotifModal, setShowNotifModal] = useState(false);
  const {
    notifications,
    unreadCount,
    activeToast,
    markAllAsRead,
    clearAll,
    dismissToast,
  } = useNotificationHub(locale);

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
    <>
      <header
        className="sticky top-0 z-50 flex h-[52px] items-center gap-2 px-3 sm:px-4"
        style={{ background: 'var(--color-primary)' }}
      >
        {/* 로고 */}
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
            <span className="hidden xs:inline">{locale === 'vi' ? 'AI Bác sĩ' : locale === 'en' ? 'AI Doctor' : 'AI 진단'}</span>
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

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {/* 실시간 알림 센터 벨 아이콘 */}
          <button
            onClick={() => setShowNotifModal(true)}
            className="relative flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 active:scale-95 transition-all"
            aria-label="Notification Hub"
            title="실시간 알림 센터 & Zalo"
          >
            <span className="text-sm">🔔</span>
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-yellow-400 px-1 text-[10px] font-black text-red-900 shadow-sm animate-pulse">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* 언어 전환 */}
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

      {/* 실시간 알림 센터 모달 */}
      <NotificationModal
        locale={locale}
        isOpen={showNotifModal}
        onClose={() => setShowNotifModal(false)}
        notifications={notifications}
        onMarkAllRead={markAllAsRead}
        onClearAll={clearAll}
      />

      {/* 새 알림 발생 시 상단 플로팅 토스트 */}
      <NotificationToast
        toast={activeToast}
        onDismiss={dismissToast}
      />
    </>
  );
}
