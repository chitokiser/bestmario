'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthState } from '@/hooks/useAuthState';
import { useSupabase } from '@/hooks/useSupabase';
import type { TechnicianProfile } from '@/types/supabase';

const NAV = [
  { href: '',             icon: '🧰', ko: '주문',   vi: 'Đơn hàng', en: 'Orders' },
  { href: '/quotes',      icon: '🧾', ko: '견적',   vi: 'Báo giá',  en: 'Quotes' },
  { href: '/settlements', icon: '💰', ko: '정산',   vi: 'Thanh toán', en: 'Earnings' },
  { href: '/profile',     icon: '👤', ko: '프로필', vi: 'Hồ sơ',    en: 'Profile' },
];

// 컴포넌트 함수 밖에 둔다 — 안에서 정의하면 매 렌더마다 새 타입이 되어 서브트리가 remount 된다
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen px-4 py-6" style={{ background: 'var(--color-bg)' }}>
      <div className="mx-auto w-full max-w-lg">{children}</div>
    </main>
  );
}

function Notice({
  icon,
  title,
  body,
  action,
}: {
  icon: string;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <Shell>
      <div className="rounded-2xl border p-6 text-center" style={{ background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #ebebed)' }}>
        <div className="text-4xl mb-3">{icon}</div>
        <p className="text-sm font-bold mb-1" style={{ color: 'var(--color-text)' }}>{title}</p>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>{body}</p>
        {action}
      </div>
    </Shell>
  );
}

export default function TechnicianLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = use(params);
  const router = useRouter();
  const pathname = usePathname();
  const supabase = useSupabase();
  const { user, role, roleLoading, authLoading } = useAuthState();

  const [profile, setProfile] = useState<TechnicianProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);

  const t = (ko: string, vi: string, en: string) =>
    locale === 'vi' ? vi : locale === 'en' ? en : ko;

  const loadProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }
    const { data } = await supabase
      .from('technician_profiles')
      .select('*')
      .eq('uid', user.uid)
      .maybeSingle();
    setProfile((data ?? null) as TechnicianProfile | null);
    setProfileLoading(false);
  }, [supabase, user]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const handleRegister = async () => {
    if (!user || registering) return;
    setRegistering(true);
    setRegisterError(null);
    try {
      // guard_user_role 트리거가 customer → technician 자가 변경만 허용한다
      const { error: roleErr } = await supabase
        .from('users')
        .update({ role: 'technician' })
        .eq('uid', user.uid);
      if (roleErr) throw new Error(roleErr.message);

      const { error: profErr } = await supabase
        .from('technician_profiles')
        .upsert({ uid: user.uid, status: 'pending' }, { onConflict: 'uid', ignoreDuplicates: true });
      if (profErr) throw new Error(profErr.message);

      await loadProfile();
      router.push(`/${locale}/technician/profile`);
    } catch (e) {
      setRegisterError(e instanceof Error ? e.message : String(e));
    } finally {
      setRegistering(false);
    }
  };

  if (authLoading || roleLoading || profileLoading) {
    return <Shell><p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{t('불러오는 중…', 'Đang tải…', 'Loading…')}</p></Shell>;
  }

  if (!user) {
    return (
      <Notice
        icon="🔒"
        title={t('로그인이 필요합니다', 'Cần đăng nhập', 'Login required')}
        body={t('홈에서 로그인한 뒤 다시 시도해 주세요.', 'Hãy đăng nhập ở trang chủ rồi thử lại.', 'Log in from the home page and try again.')}
        action={
          <button
            onClick={() => router.push(`/${locale}`)}
            className="mt-4 rounded-xl px-5 py-2.5 text-sm font-bold text-white"
            style={{ background: 'var(--color-primary)' }}
          >
            {t('홈으로', 'Về trang chủ', 'Go home')}
          </button>
        }
      />
    );
  }

  // role 이 없거나 customer 인 경우 — 리다이렉트하지 않고 등록 경로를 제공한다
  if (role !== 'technician') {
    return (
      <Notice
        icon="🛠️"
        title={t('기술자 계정이 아닙니다', 'Chưa phải tài khoản kỹ thuật viên', 'Not a technician account')}
        body={
          role === null
            ? t(
                '계정 정보를 찾을 수 없습니다. 홈에서 다시 로그인하면 계정이 생성됩니다.',
                'Không tìm thấy thông tin tài khoản. Hãy đăng nhập lại ở trang chủ.',
                'No account record found. Log in again from the home page to create one.'
              )
            : t(
                'BestMario 출장서비스기사로 등록하시겠습니까? 등록 후 관리자 승인을 받으면 주문을 받을 수 있습니다.',
                'Bạn muốn đăng ký làm kỹ thuật viên BestMario? Sau khi quản trị phê duyệt, bạn có thể nhận đơn.',
                'Register as a BestMario technician? After admin approval you can take orders.'
              )
        }
        action={
          <>
            {registerError && (
              <p className="mt-3 text-xs font-semibold" style={{ color: '#D32F2F' }}>{registerError}</p>
            )}
            {role === 'customer' ? (
              <button
                onClick={handleRegister}
                disabled={registering}
                className="mt-4 rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                style={{ background: 'var(--color-primary)' }}
              >
                {registering ? t('처리 중…', 'Đang xử lý…', 'Processing…') : t('기술자로 등록 신청', 'Đăng ký kỹ thuật viên', 'Register as technician')}
              </button>
            ) : (
              <button
                onClick={() => router.push(`/${locale}`)}
                className="mt-4 rounded-xl px-5 py-2.5 text-sm font-bold text-white"
                style={{ background: 'var(--color-primary)' }}
              >
                {t('홈으로', 'Về trang chủ', 'Go home')}
              </button>
            )}
          </>
        }
      />
    );
  }

  const onProfilePage = pathname.endsWith('/technician/profile');

  // 승인 대기 중에는 프로필(서류 등록)만 열어 둔다
  if (profile?.status !== 'active' && !onProfilePage) {
    return (
      <Notice
        icon={profile?.status === 'suspended' ? '⛔' : '⏳'}
        title={
          profile?.status === 'suspended'
            ? t('계정이 정지되었습니다', 'Tài khoản bị tạm ngưng', 'Account suspended')
            : t('관리자 승인 대기 중', 'Đang chờ phê duyệt', 'Awaiting admin approval')
        }
        body={
          profile?.status === 'suspended'
            ? t('고객센터로 문의해 주세요.', 'Vui lòng liên hệ CSKH.', 'Please contact support.')
            : t(
                '프로필에서 기술 분야와 서류를 등록하면 관리자가 확인 후 승인합니다.',
                'Hãy điền hồ sơ và tải giấy tờ; quản trị sẽ xem xét và phê duyệt.',
                'Fill in your profile and upload documents; an admin will review and approve.'
              )
        }
        action={
          <button
            onClick={() => router.push(`/${locale}/technician/profile`)}
            className="mt-4 rounded-xl px-5 py-2.5 text-sm font-bold text-white"
            style={{ background: 'var(--color-primary)' }}
          >
            {t('프로필 작성하기', 'Điền hồ sơ', 'Complete profile')}
          </button>
        }
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--color-bg)' }}>
      <header className="sticky top-0 z-40 px-4 py-3" style={{ background: 'var(--color-primary)' }}>
        <p className="text-sm font-extrabold text-white">
          🛠️ BestMario {t('기술자', 'Kỹ thuật viên', 'Technician')}
        </p>
      </header>

      <div className="flex-1 px-4 py-5">
        <div className="mx-auto w-full max-w-lg">{children}</div>
      </div>

      <nav
        className="sticky bottom-0 z-50 grid grid-cols-4 border-t"
        style={{ background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #ebebed)' }}
      >
        {NAV.map((n) => {
          const href = `/${locale}/technician${n.href}`;
          const active = n.href === '' ? pathname.endsWith('/technician') : pathname.endsWith(n.href);
          return (
            <button
              key={n.href}
              onClick={() => router.push(href)}
              className="flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-bold"
              style={{ color: active ? 'var(--color-primary)' : 'var(--color-text-muted)' }}
            >
              <span className="text-lg">{n.icon}</span>
              {t(n.ko, n.vi, n.en)}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
