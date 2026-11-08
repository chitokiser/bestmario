'use client';

import { useRouter } from 'next/navigation';
import { AppNotification } from '@/hooks/useNotificationHub';
import { BESTMARIO_ZALO_PHONE, getZaloDirectLink } from '@/lib/zaloDispatch';
import { formatDateTime } from '@/lib/format';

export default function NotificationModal({
  locale,
  isOpen,
  onClose,
  notifications,
  onMarkAllRead,
  onClearAll,
}: {
  locale: string;
  isOpen: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  onMarkAllRead: () => void;
  onClearAll: () => void;
}) {
  const router = useRouter();

  if (!isOpen) return null;

  const t = (ko: string, vi: string, en: string) =>
    locale === 'vi' ? vi : locale === 'en' ? en : ko;

  const getIcon = (type: AppNotification['type']) => {
    switch (type) {
      case 'order_created':
        return '⚡';
      case 'tech_dispatched':
        return '🚗';
      case 'payment_confirmed':
        return '🛡️';
      case 'work_completed':
        return '📷';
      case 'payout_paid':
        return '💰';
      default:
        return '🔔';
    }
  };

  const handleOpenItem = (item: AppNotification) => {
    if (item.link) {
      onClose();
      router.push(item.link);
    }
  };

  const zaloUrl = getZaloDirectLink(BESTMARIO_ZALO_PHONE);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center sm:items-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="w-full max-w-md max-h-[85vh] flex flex-col rounded-3xl border shadow-2xl overflow-hidden mt-12 sm:mt-0"
        style={{ background: 'var(--color-surface, #fff)', borderColor: 'var(--color-border, #ebebed)' }}
      >
        {/* 헤더 */}
        <div
          className="flex items-center justify-between p-4 border-b shrink-0"
          style={{ borderColor: 'var(--color-border, #ebebed)' }}
        >
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-100 text-base">
              🔔
            </span>
            <div>
              <h2 className="text-sm font-black" style={{ color: 'var(--color-text)' }}>
                {t('실시간 알림 센터', 'Trung tâm thông báo', 'Notification Hub')}
              </h2>
              <p className="text-[10px] text-gray-500">Zalo & Push Live Feed</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {notifications.some((n) => !n.read) && (
              <button
                onClick={onMarkAllRead}
                className="rounded-lg bg-gray-100 px-2 py-1 text-[11px] font-bold text-gray-600 hover:bg-gray-200"
              >
                {t('모두 읽음', 'Đọc hết', 'Mark all read')}
              </button>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-lg font-bold p-1"
            >
              ✕
            </button>
          </div>
        </div>

        {/* 잘로(Zalo) 연동 배너 */}
        <div
          className="p-3.5 mx-4 mt-3 rounded-2xl border flex items-center justify-between gap-3 shrink-0"
          style={{
            background: 'linear-gradient(135deg, #E3F2FD 0%, #FFFFFF 65%, #E1F5FE 100%)',
            borderColor: '#90CAF9',
          }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white font-black text-xs shadow-sm">
              Zalo
            </div>
            <div className="min-w-0">
              <p className="text-xs font-black text-blue-950 truncate">
                {t('잘로(Zalo) 실시간 알림톡 연동', 'Nhận thông báo qua Zalo', 'Zalo Instant Alert Hub')}
              </p>
              <p className="text-[10px] text-blue-800 line-clamp-1 mt-0.5">
                {t('기술자 배정 및 출동 현황을 Zalo로 1초 만에 수신', 'Theo dõi điều phối thợ qua Zalo trong 1 giây', 'Realtime dispatch updates right on Zalo')}
              </p>
            </div>
          </div>

          <a
            href={zaloUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-xl bg-blue-600 px-3 py-1.5 text-[11px] font-extrabold text-white shadow-sm hover:bg-blue-700 active:scale-95 transition-transform"
          >
            {t('Zalo 연결', 'Mở Zalo', 'Open Zalo')}
          </a>
        </div>

        {/* 알림 목록 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {notifications.length === 0 ? (
            <div className="py-12 text-center text-xs text-gray-400">
              <span className="text-3xl block mb-2">🔕</span>
              {t('새로운 알림이 없습니다.', 'Không có thông báo mới.', 'No notifications yet.')}
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                onClick={() => handleOpenItem(n)}
                className={`p-3 rounded-2xl border transition-all cursor-pointer hover:shadow-xs ${
                  !n.read ? 'bg-red-50/50 border-red-200' : 'bg-white border-gray-100'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base">{getIcon(n.type)}</span>
                    <span className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>
                      {n.title}
                    </span>
                  </div>
                  {!n.read && (
                    <span className="h-2 w-2 rounded-full bg-red-500 shrink-0 mt-1" />
                  )}
                </div>

                <p className="text-[11px] text-gray-600 mt-1 pl-6 leading-relaxed">
                  {n.body}
                </p>

                <div className="flex items-center justify-between mt-2 pl-6 pt-1 text-[10px] text-gray-400 border-t border-gray-100">
                  <span>{formatDateTime(n.timestamp, locale)}</span>
                  {n.link && (
                    <span className="font-bold text-red-600 hover:underline">
                      {t('확인하기 →', 'Xem ngay →', 'View →')}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* 푸터 */}
        {notifications.length > 0 && (
          <div className="p-3 border-t bg-gray-50 flex items-center justify-between text-[11px] text-gray-500 shrink-0">
            <span>{t('최근 50개 알림 보관', 'Lưu 50 thông báo gần nhất', 'Last 50 notifications')}</span>
            <button
              onClick={onClearAll}
              className="font-semibold text-gray-400 hover:text-red-600"
            >
              {t('내역 전체 삭제', 'Xóa tất cả', 'Clear all')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
