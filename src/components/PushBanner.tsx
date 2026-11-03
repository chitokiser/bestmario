'use client';

import { usePush } from '@/hooks/usePush';

/** 새 주문 알림 켜기/끄기. 지원하지 않는 환경에서는 아무것도 보이지 않는다. */
export default function PushBanner({ locale }: { locale: string }) {
  const { state, error, enable, disable } = usePush();
  const t = (ko: string, vi: string, en: string) =>
    locale === 'vi' ? vi : locale === 'en' ? en : ko;

  if (state === 'unsupported' || state === 'loading') return null;

  return (
    <div
      className="mb-4 flex items-center gap-3 rounded-2xl border px-4 py-3"
      style={{ background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #ebebed)' }}
    >
      <span className="text-xl" aria-hidden>{state === 'on' ? '🔔' : '🔕'}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>
          {state === 'on'
            ? t('새 요청 알림 켜짐', 'Đã bật thông báo yêu cầu mới', 'New-request alerts on')
            : t('새 요청 알림 받기', 'Nhận thông báo yêu cầu mới', 'Get new-request alerts')}
        </p>
        <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          {state === 'denied'
            ? t('브라우저 설정에서 알림을 허용해 주세요.', 'Hãy cho phép thông báo trong cài đặt trình duyệt.', 'Allow notifications in your browser settings.')
            : t('내 분야에 요청이 들어오면 바로 알려 드려요.', 'Báo ngay khi có yêu cầu thuộc lĩnh vực của bạn.', 'We alert you when a request matches your skills.')}
        </p>
        {error && <p className="text-[11px] font-semibold" style={{ color: '#D32F2F' }}>{error}</p>}
      </div>
      {state !== 'denied' && (
        <button
          onClick={state === 'on' ? disable : enable}
          className="shrink-0 rounded-xl px-3 py-2 text-xs font-bold"
          style={
            state === 'on'
              ? { border: '1px solid var(--color-border, #ebebed)', color: 'var(--color-text-muted)' }
              : { background: 'var(--color-primary)', color: '#fff' }
          }
        >
          {state === 'on' ? t('끄기', 'Tắt', 'Turn off') : t('켜기', 'Bật', 'Turn on')}
        </button>
      )}
    </div>
  );
}
