'use client';

import type { TechnicianProfile } from '@/types/supabase';

type Tone = 'wait' | 'ok' | 'bad';

const TONE: Record<Tone, { color: string; bg: string }> = {
  wait: { color: '#E65100', bg: '#FFF3E0' },
  ok:   { color: '#2E7D32', bg: '#E8F5E9' },
  bad:  { color: '#C62828', bg: '#FFEBEE' },
};

/** 기술자 신청의 진행상태(제출 → 심사중 → 승인완료/반려)를 보여 주는 카드. */
export default function ApplicationStatus({
  profile,
  locale,
  onAction,
}: {
  profile: TechnicianProfile;
  locale: string;
  onAction: (path: string) => void;
}) {
  const t = (ko: string, vi: string, en: string) =>
    locale === 'vi' ? vi : locale === 'en' ? en : ko;

  const submitted = Boolean(profile.submitted_at);
  const date = profile.submitted_at
    ? new Date(profile.submitted_at).toLocaleDateString(locale === 'vi' ? 'vi-VN' : locale === 'en' ? 'en-US' : 'ko-KR')
    : '';

  let tone: Tone = 'wait';
  let label = '';
  let desc = '';
  let action: { text: string; path: string } | null = null;
  // 단계: 0=제출 1=심사 2=결과
  let step = 1;

  switch (profile.status) {
    case 'active':
      tone = 'ok';
      step = 2;
      label = t('승인 완료', 'Đã phê duyệt', 'Approved');
      desc = t('정식 기술자로 등록되었습니다. 주문을 받을 수 있어요.', 'Bạn đã là kỹ thuật viên chính thức và có thể nhận đơn.', 'You are a registered technician and can take orders.');
      action = { text: t('기술자 화면 열기', 'Mở trang kỹ thuật viên', 'Open technician area'), path: '/technician' };
      break;
    case 'rejected':
      tone = 'bad';
      step = 2;
      label = t('반려', 'Bị từ chối', 'Rejected');
      desc = `${t('사유', 'Lý do', 'Reason')}: ${profile.reject_reason || '-'}`;
      action = { text: t('수정해서 다시 제출', 'Sửa và gửi lại', 'Edit and resubmit'), path: '/apply/technician' };
      break;
    case 'suspended':
      tone = 'bad';
      step = 2;
      label = t('정지', 'Tạm ngưng', 'Suspended');
      desc = t('계정이 정지되었습니다. 고객센터로 문의해 주세요.', 'Tài khoản bị tạm ngưng. Vui lòng liên hệ CSKH.', 'Your account is suspended. Please contact support.');
      break;
    default:
      if (submitted) {
        label = t('심사중', 'Đang xét duyệt', 'Under review');
        desc = t('관리자가 서류를 확인하고 있어요. 승인되면 활동할 수 있습니다.', 'Quản trị đang xem xét hồ sơ. Sau khi duyệt bạn có thể hoạt động.', 'An admin is reviewing your documents.');
      } else {
        step = 0;
        label = t('신청서 미제출', 'Chưa gửi đơn', 'Not submitted');
        desc = t('신청서를 제출해야 심사가 시작됩니다.', 'Cần gửi đơn để bắt đầu xét duyệt.', 'Submit the application to start the review.');
        action = { text: t('신청서 작성', 'Điền đơn đăng ký', 'Fill in application'), path: '/apply/technician' };
      }
  }

  const steps = [
    t('신청 제출', 'Gửi đơn', 'Submitted'),
    t('심사중', 'Xét duyệt', 'In review'),
    profile.status === 'rejected' ? t('반려', 'Từ chối', 'Rejected') : t('승인 완료', 'Phê duyệt', 'Approved'),
  ];
  const c = TONE[tone];

  return (
    <section
      className="rounded-2xl border p-4 shadow-sm"
      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
      aria-label={t('기술자 신청 진행상태', 'Tiến trình đăng ký kỹ thuật viên', 'Technician application status')}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-bold" style={{ color: 'var(--color-text-muted)' }}>
          {t('기술자 신청 현황', 'Tiến trình đăng ký', 'Application status')}
        </h2>
        <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ color: c.color, background: c.bg }}>
          {label}
        </span>
      </div>

      <ol className="mt-3 flex items-center">
        {steps.map((s, i) => {
          const reached = i <= step && (i < step || submitted || i === 0);
          const isLast = i === steps.length - 1;
          const dot = i === step ? c.color : reached ? '#2E7D32' : 'var(--color-border)';
          return (
            <li key={s} className="flex flex-1 items-center last:flex-none" aria-current={i === step ? 'step' : undefined}>
              <div className="flex flex-col items-center gap-1">
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-extrabold text-white"
                  style={{ background: dot }}
                >
                  {i < step || (i === step && tone === 'ok') ? '✓' : i + 1}
                </span>
                <span className="text-[10px] font-semibold" style={{ color: i === step ? c.color : 'var(--color-text-muted)' }}>
                  {s}
                </span>
              </div>
              {!isLast && (
                <span
                  className="mx-1 mb-4 h-0.5 flex-1"
                  style={{ background: i < step ? '#2E7D32' : 'var(--color-border)' }}
                />
              )}
            </li>
          );
        })}
      </ol>

      <p className="mt-3 text-xs leading-relaxed" style={{ color: 'var(--color-text)' }}>{desc}</p>
      {date && (
        <p className="mt-1 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          {t('제출일', 'Ngày gửi', 'Submitted')}: {date}
        </p>
      )}
      {action && (
        <button
          onClick={() => onAction(action.path)}
          className="mt-3 w-full rounded-xl py-2.5 text-sm font-bold text-white"
          style={{ background: 'var(--color-primary)' }}
        >
          {action.text}
        </button>
      )}
    </section>
  );
}
