'use client';

import { use } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthState } from '@/hooks/useAuthState';

const NAV = [
  { href: '',             icon: '📊', ko: '대시보드', vi: 'Tổng quan',  en: 'Dashboard' },
  { href: '/technicians', icon: '🛠️', ko: '기술자',   vi: 'Kỹ thuật viên', en: 'Technicians' },
  { href: '/orders',      icon: '🧰', ko: '주문',     vi: 'Đơn hàng',   en: 'Orders' },
  { href: '/payments',    icon: '💳', ko: '결제·설정', vi: 'Thanh toán', en: 'Payments' },
];

export default function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = use(params);
  const router = useRouter();
  const pathname = usePathname();
  const { user, role, roleLoading, authLoading } = useAuthState();

  const t = (ko: string, vi: string, en: string) =>
    locale === 'vi' ? vi : locale === 'en' ? en : ko;

  if (authLoading || roleLoading) {
    return (
      <main className="min-h-screen px-4 py-6" style={{ background: 'var(--color-bg)' }}>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {t('불러오는 중…', 'Đang tải…', 'Loading…')}
        </p>
      </main>
    );
  }

  // Review Focus #5 — role 이 설정되지 않은 경우를 조용한 리다이렉트로 숨기지 않는다.
  // 최초 관리자는 자가 승격이 불가능하므로(guard_user_role) 무엇을 해야 하는지 알려준다.
  if (!user || role !== 'admin') {
    return (
      <main className="min-h-screen px-4 py-6" style={{ background: 'var(--color-bg)' }}>
        <div className="mx-auto w-full max-w-lg rounded-2xl border p-6" style={{ background: 'var(--color-surface, #fff)', borderColor: '#D32F2F' }}>
          <div className="text-4xl mb-3 text-center">🔐</div>
          <p className="text-sm font-bold mb-2 text-center" style={{ color: 'var(--color-text)' }}>
            {t('관리자 권한이 없습니다', 'Không có quyền quản trị', 'Admin access required')}
          </p>

          <p className="text-xs leading-relaxed mb-3" style={{ color: 'var(--color-text-muted)' }}>
            {!user
              ? t('먼저 홈에서 로그인해 주세요.', 'Hãy đăng nhập ở trang chủ trước.', 'Please log in from the home page first.')
              : role === null
                ? t(
                    '계정 역할을 읽지 못했습니다. ① Supabase users 테이블에 이 계정의 행이 없는 경우 — 홈에서 다시 로그인하면 생성됩니다. ② Supabase 설정이 끝나지 않은 경우 — 프로젝트 생성, Third Party Auth(Firebase) 등록, 001~003 마이그레이션 적용 여부를 확인해 주세요.',
                    'Không đọc được vai trò. ① Chưa có bản ghi trong bảng users của Supabase — hãy đăng nhập lại ở trang chủ. ② Supabase chưa cấu hình xong — kiểm tra project, Third Party Auth (Firebase) và migration 001~003.',
                    'Could not read the account role. (1) No row for this account in the Supabase users table — log in again from the home page. (2) Supabase setup is incomplete — check the project, Third Party Auth (Firebase), and migrations 001–003.'
                  )
                : t(
                    `현재 역할은 '${role}' 입니다. 관리자 권한은 자가 설정할 수 없습니다.`,
                    `Vai trò hiện tại là '${role}'. Không thể tự cấp quyền quản trị.`,
                    `Your current role is '${role}'. Admin rights cannot be self-assigned.`
                  )}
          </p>

          {user && (
            <div className="rounded-xl p-3 text-[11px] leading-relaxed" style={{ background: 'var(--color-bg, #f7f7f8)', color: 'var(--color-text-2, #5c5c6e)' }}>
              <p className="font-bold mb-1">
                {t('최초 관리자 지정 방법', 'Cách chỉ định quản trị đầu tiên', 'How to set the first admin')}
              </p>
              <p>
                {t(
                  'Supabase Dashboard > Table Editor > users 에서 아래 uid 행의 role 을 admin 으로 변경하세요.',
                  'Trong Supabase Dashboard > Table Editor > users, đổi role của uid dưới đây thành admin.',
                  'In Supabase Dashboard > Table Editor > users, set the role of the uid below to admin.'
                )}
              </p>
              <code className="mt-1.5 block break-all font-mono" style={{ color: 'var(--color-primary)' }}>
                {user.uid}
              </code>
            </div>
          )}

          <button
            onClick={() => router.push(`/${locale}`)}
            className="mt-4 w-full rounded-xl py-2.5 text-sm font-bold text-white"
            style={{ background: 'var(--color-primary)' }}
          >
            {t('홈으로', 'Về trang chủ', 'Go home')}
          </button>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--color-bg)' }}>
      <header className="sticky top-[52px] z-40 px-4 py-2" style={{ background: '#1A1A1F' }}>
        <p className="text-sm font-extrabold text-white">
          ⚙️ BestMario {t('관리자', 'Quản trị', 'Admin')}
        </p>
      </header>

      <div className="flex-1 px-4 py-5">
        <div className="mx-auto w-full max-w-3xl">{children}</div>
      </div>

      <nav
        className="sticky bottom-0 z-50 grid grid-cols-4 border-t"
        style={{ background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #ebebed)' }}
      >
        {NAV.map((n) => {
          const active = n.href === '' ? pathname.endsWith('/admin') : pathname.endsWith(n.href);
          return (
            <button
              key={n.href}
              onClick={() => router.push(`/${locale}/admin${n.href}`)}
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
