'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppNotification } from '@/hooks/useNotificationHub';

export default function NotificationToast({
  toast,
  onDismiss,
}: {
  toast: AppNotification | null;
  onDismiss: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      onDismiss();
    }, 6000);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;

  const handleClick = () => {
    if (toast.link) {
      router.push(toast.link);
    }
    onDismiss();
  };

  return (
    <div className="fixed top-16 right-4 left-4 sm:left-auto sm:w-96 z-50 pointer-events-auto animate-in slide-in-from-top-4 duration-300">
      <div
        onClick={handleClick}
        className="rounded-2xl border p-4 shadow-xl bg-white flex items-start gap-3 cursor-pointer hover:shadow-2xl transition-all border-red-300"
        style={{
          background: 'linear-gradient(135deg, #FFFFFF 0%, #FFF5F5 100%)',
        }}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-100 text-lg shadow-xs">
          ⚡
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <p className="text-xs font-black text-gray-900 truncate">
              {toast.title}
            </p>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDismiss();
              }}
              className="text-gray-400 hover:text-gray-600 text-sm font-bold pl-2"
            >
              ✕
            </button>
          </div>
          <p className="text-[11px] text-gray-600 mt-0.5 line-clamp-2 leading-relaxed">
            {toast.body}
          </p>
          {toast.link && (
            <p className="text-[10px] font-extrabold text-red-600 mt-1">
              지금 확인하기 →
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
