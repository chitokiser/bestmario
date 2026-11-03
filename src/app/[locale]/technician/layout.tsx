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
                '기술분야·경력·자기소개와 사진·신분증을 제출하면 관리자가 확인 후 승인합니다. 승인되면 주문을 받을 수 있습니다.',
                'Gửi lĩnh vực, kinh nghiệm, giới thiệu cùng ảnh và giấy tờ tùy thân; quản trị sẽ xem xét. Sau khi được duyệt bạn có thể nhận đơn.',
                'Submit your skills, experience, bio, photo and ID; an admin will review. Once approved you can take orders.'
              )
        }
        action={
          <button
            onClick={() => router.push(role === 'customer' ? `/${locale}/apply/technician` : `/${locale}`)}
            className="mt-4 rounded-xl px-5 py-2.5 text-sm font-bold text-white"
            style={{ background: 'var(--color-primary)' }}
          >
            {role === 'customer'
              ? t('기술자 신청서 작성', 'Điền đơn đăng ký', 'Fill in application')
              : t('홈으로', 'Về trang chủ', 'Go home')}
          </button>
        }
      />
    );
  }

  const onProfilePage = pathname.endsWith('/technician/profile');

  // 승인 전에는 프로필 화면만 열어 둔다 (승인 대기·반려 상태에서 서류 확인용)
  if (profile?.status !== 'active' && !onProfilePage) {
    const status = profile?.status;
    const submitted = Boolean(profile?.submitted_at);
    const needsApply = !profile || status === 'rejected' || !submitted;
    const icon = status === 'suspended' ? '⛔' : status === 'rejected' ? '📝' : needsApply ? '🧰' : '⏳';
    const title =
      status === 'suspended'
        ? t('계정이 정지되었습니다', 'Tài khoản bị tạm ngưng', 'Account suspended')
        : status === 'rejected'
          ? t('신청이 반려되었습니다', 'Đơn đăng ký bị từ chối', 'Application rejected')
          : needsApply
            ? t('기술자 신청서를 제출해 주세요', 'Hãy gửi đơn đăng ký', 'Please submit your application')
            : t('관리자 승인 대기 중', 'Đang chờ phê duyệt', 'Awaiting admin approval');
    const body =
      status === 'suspended'
        ? t('고객센터로 문의해 주세요.', 'Vui lòng liên hệ CSKH.', 'Please contact support.')
        : status === 'rejected'
          ? `${t('사유', 'Lý do', 'Reason')}: ${profile?.reject_reason || '-'}`
          : needsApply
            ? t(
                '기술분야·경력·자기소개와 사진·신분증을 제출해야 승인 심사가 시작됩니다.',
                'Cần gửi lĩnh vực, kinh nghiệm, giới thiệu, ảnh và giấy tờ để được xét duyệt.',
                'Submit your skills, experience, bio, photo and ID to start the review.'
              )
            : t(
                '제출하신 신청서를 관리자가 확인하고 있습니다. 승인되면 주문을 받을 수 있습니다.',
                'Quản trị đang xem xét đơn của bạn. Sau khi được duyệt bạn có thể nhận đơn.',
                'An admin is reviewing your application. You can take orders once approved.'
              );
    return (
      <Notice
        icon={icon}
        title={title}
        body={body}
        action={
          status === 'suspended' ? undefined : (
            <button
              onClick={() => router.push(needsApply ? `/${locale}/apply/technician` : `/${locale}/technician/profile`)}
              className="mt-4 rounded-xl px-5 py-2.5 text-sm font-bold text-white"
              style={{ background: 'var(--color-primary)' }}
            >
              {status === 'rejected'
                ? t('수정해서 다시 제출', 'Sửa và gửi lại', 'Edit and resubmit')
                : needsApply
                  ? t('신청서 작성', 'Điền đơn đăng ký', 'Fill in application')
                  : t('제출 내용 보기', 'Xem hồ sơ đã gửi', 'View submission')}
            </button>
          )
        }
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--color-bg)' }}>
      <header className="sticky top-[52px] z-40 px-4 py-2" style={{ background: 'var(--color-primary)' }}>
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
