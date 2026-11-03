'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuthState } from '@/hooks/useAuthState';
import { useSupabase } from '@/hooks/useSupabase';
import ApplicationStatus from '@/components/ApplicationStatus';
import type { TechnicianProfile, UserRole } from '@/types/supabase';

const ROLE_LABEL: Record<UserRole, { ko: string; vi: string; en: string }> = {
  customer:   { ko: '고객',   vi: 'Khách hàng',    en: 'Customer' },
  technician: { ko: '기술자', vi: 'Kỹ thuật viên', en: 'Technician' },
  admin:      { ko: '관리자', vi: 'Quản trị',      en: 'Admin' },
};

const SURFACE = { background: 'var(--color-surface)', borderColor: 'var(--color-border)' } as const;

export default function MyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  const router = useRouter();
  const { user, wallets, role, roleLoading, authLoading } = useAuthState();
  const supabase = useSupabase();
  const [application, setApplication] = useState<TechnicianProfile | null>(null);

  // 기술자 신청 진행상태 (신청 이력이 있는 계정만)
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void supabase
      .from('technician_profiles')
      .select('*')
      .eq('uid', user.uid)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setApplication((data ?? null) as TechnicianProfile | null);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, user]);

  const t = (ko: string, vi: string, en: string) =>
    locale === 'vi' ? vi : locale === 'en' ? en : ko;

  const fmt = (n: number) =>
    new Intl.NumberFormat(locale === 'vi' ? 'vi-VN' : locale === 'en' ? 'en-US' : 'ko-KR').format(n);

  const handleLogout = async () => {
    await signOut(auth);
    router.push(`/${locale}`);
  };

  const name = user?.displayName ?? user?.email ?? '';
  const initial = name.trim().charAt(0).toUpperCase() || '?';

  // 포인트 값이 아직 없으면(로딩/미연동) 0 이 아니라 '–' 로 보여 준다
  const tiles = [
    { icon: '💎', label: 'BM',    value: wallets ? fmt(wallets.pointBalanceVnd) : '–' },
    { icon: '🎟️', label: 'BT',    value: wallets ? fmt(wallets.btBalance) : '–' },
    { icon: '⭐', label: 'Point', value: wallets ? fmt(wallets.pointBalance) : '–' },
  ];

  const rows: { icon: string; label: string; sub?: string; href: string }[] = [
    { icon: '🧾', label: t('내 주문 내역', 'Đơn hàng của tôi', 'My orders'), href: '/orders' },
    { icon: '🛠️', label: t('서비스 신청', 'Đặt dịch vụ', 'Request service'), href: '/order/new' },
  ];
  if (!roleLoading) {
    if (role === 'admin') {
      rows.push({ icon: '🛡️', label: t('관리자 화면', 'Trang quản trị', 'Admin console'), href: '/admin' });
    } else if (role === 'technician') {
      rows.push({ icon: '🧰', label: t('기술자 화면', 'Trang kỹ thuật viên', 'Technician dashboard'), href: '/technician' });
    } else if (role === 'customer' && !application) {
      rows.push({
        icon: '🧰',
        label: t('기술자로 등록하기', 'Đăng ký kỹ thuật viên', 'Register as technician'),
        sub: t(
          '등록 후 관리자 승인을 받으면 주문을 받을 수 있어요',
          'Sau khi quản trị phê duyệt, bạn có thể nhận đơn',
          'Take orders after admin approval',
        ),
        href: '/apply/technician',
      });
    }
  }

  return (
    <main className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
      {/* 상단: 프로필 */}
      <div
        className="px-5 pb-16 pt-4"
        style={{ background: 'linear-gradient(160deg, #B71C1C 0%, #E53935 55%, #C62828 100%)' }}
      >
        <div className="mx-auto w-full max-w-lg">
          <button
            onClick={() => router.push(`/${locale}`)}
            className="text-xs font-semibold text-white/85 transition-colors hover:text-white"
          >
            ← {t('홈', 'Trang chủ', 'Home')}
          </button>

          <h1 className="mt-3 text-xl font-extrabold text-white">
            {t('마이페이지', 'Cá nhân', 'My Page')}
          </h1>

          {user && (
            <div className="mt-4 flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/20 text-lg font-extrabold text-white">
                {initial}
              </div>
              <div className="min-w-0">
                <p className="truncate text-base font-extrabold leading-tight text-white">{name}</p>
                {user.email && user.email !== name && (
                  <p className="truncate text-xs text-white/75">{user.email}</p>
                )}
              </div>
              {role && (
                <span className="ml-auto shrink-0 rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-bold text-white">
                  {t(ROLE_LABEL[role].ko, ROLE_LABEL[role].vi, ROLE_LABEL[role].en)}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto -mt-10 w-full max-w-lg px-4 pb-10">
        {authLoading ? (
          <p className="text-sm text-white/90">{t('불러오는 중…', 'Đang tải…', 'Loading…')}</p>
        ) : !user ? (
          <section className="rounded-2xl border p-8 text-center shadow-sm" style={SURFACE}>
            <div className="mb-3 text-4xl">🔒</div>
            <p className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>
              {t('로그인이 필요합니다', 'Cần đăng nhập', 'Login required')}
            </p>
            <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {t('홈에서 로그인한 뒤 다시 열어 주세요.', 'Hãy đăng nhập ở trang chủ rồi thử lại.', 'Log in from the home page and try again.')}
            </p>
            <button
              onClick={() => router.push(`/${locale}`)}
              className="mt-4 rounded-xl px-5 py-2.5 text-sm font-bold text-white"
              style={{ background: 'var(--color-primary)' }}
            >
              {t('홈으로', 'Về trang chủ', 'Go home')}
            </button>
          </section>
        ) : (
          <>
            {/* 지갑·포인트: 헤더에서 옮겨 왔다 */}
            <section className="rounded-2xl border p-4 shadow-sm" style={SURFACE}>
              <h2 className="mb-3 text-xs font-bold" style={{ color: 'var(--color-text-muted)' }}>
                {t('내 포인트', 'Điểm của tôi', 'My points')}
              </h2>
              <div className="grid grid-cols-3 gap-2">
                {tiles.map((x) => (
                  <div
                    key={x.label}
                    className="rounded-xl px-2 py-3 text-center"
                    style={{ background: 'color-mix(in srgb, var(--color-text) 6%, transparent)' }}
                  >
                    <div className="text-lg">{x.icon}</div>
                    <div className="mt-1 text-sm font-extrabold" style={{ color: 'var(--color-text)' }}>
                      {x.value}
                    </div>
                    <div className="text-[10px] font-semibold" style={{ color: 'var(--color-text-muted)' }}>
                      {x.label}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {application && (
              <div className="mt-3">
                <ApplicationStatus
                  profile={application}
                  locale={locale}
                  onAction={(path) => router.push(`/${locale}${path}`)}
                />
              </div>
            )}

            <section className="mt-3 overflow-hidden rounded-2xl border" style={SURFACE}>
              {rows.map((r, i) => (
                <button
                  key={r.href}
                  onClick={() => router.push(`/${locale}${r.href}`)}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-opacity active:opacity-70"
                  style={i > 0 ? { borderTop: '1px solid var(--color-border)' } : undefined}
                >
                  <span className="text-xl">{r.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold" style={{ color: 'var(--color-text)' }}>
                      {r.label}
                    </span>
                    {r.sub && (
                      <span className="block text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                        {r.sub}
                      </span>
                    )}
                  </span>
                  <span aria-hidden style={{ color: 'var(--color-text-muted)' }}>›</span>
                </button>
              ))}
            </section>

            <button
              onClick={handleLogout}
              className="mt-3 w-full rounded-2xl border py-3 text-sm font-bold"
              style={{ ...SURFACE, color: 'var(--color-text-muted)' }}
            >
              {t('로그아웃', 'Đăng xuất', 'Log out')}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
