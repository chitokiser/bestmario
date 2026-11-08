'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSupabase } from '@/hooks/useSupabase';
import { useAuthState } from '@/hooks/useAuthState';

export interface AppNotification {
  id: string;
  type: 'order_created' | 'tech_dispatched' | 'payment_confirmed' | 'work_completed' | 'payout_paid' | 'system';
  title: string;
  body: string;
  link?: string;
  zaloLink?: string;
  timestamp: string;
  read: boolean;
}

const STORAGE_KEY = 'bestmario_notifications_v1';

export function playNotificationChime() {
  if (typeof window === 'undefined') return;
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now); // D5
    osc1.frequency.exponentialRampToValueAtTime(880, now + 0.15); // A5

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(880, now + 0.15);
    osc2.frequency.exponentialRampToValueAtTime(1174.66, now + 0.35); // D6

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.2);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.4);
  } catch {
    // Audio context may be restricted by autoplay policy
  }
}

export function useNotificationHub(locale: string = 'vi') {
  const supabase = useSupabase();
  const { user } = useAuthState();

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [activeToast, setActiveToast] = useState<AppNotification | null>(null);

  // 로컬 스토리지에서 불러오기
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setNotifications(JSON.parse(saved) as AppNotification[]);
      } else {
        // 최초 초기 안내 알림 세팅
        const initialList: AppNotification[] = [
          {
            id: 'init-1',
            type: 'system',
            title: locale === 'vi' ? 'Chào mừng đến với BestMario!' : locale === 'en' ? 'Welcome to BestMario!' : '베스트마리오에 오신 것을 환영합니다!',
            body: locale === 'vi' ? 'Dịch vụ chẩn đoán sự cố AI & điều phối thợ tại Hà Nội qua Zalo.' : locale === 'en' ? 'Visual AI Home Doctor & Hanoi Technician Dispatch via Zalo.' : '하노이 AI 출장 홈서비스 & 잘로(Zalo) 실시간 배정 시스템이 가동되었습니다.',
            timestamp: new Date().toISOString(),
            read: false,
          },
        ];
        setNotifications(initialList);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(initialList));
      }
    } catch {
      // ignore
    }
  }, [locale]);

  const saveList = (list: AppNotification[]) => {
    setNotifications(list);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      } catch {}
    }
  };

  const addNotification = useCallback(
    (notif: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => {
      const newNotif: AppNotification = {
        ...notif,
        id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toISOString(),
        read: false,
      };

      setNotifications((prev) => {
        const next = [newNotif, ...prev.slice(0, 49)];
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          } catch {}
        }
        return next;
      });

      // 알림음 재생
      playNotificationChime();

      // 토스트 팝업 표시
      setActiveToast(newNotif);

      // 브라우저 푸시 알림도 허용된 경우 발송
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification(newNotif.title, {
            body: newNotif.body,
            icon: '/icons/icon-192.png',
          });
        } catch {}
      }
    },
    []
  );

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => {
      const next = prev.map((n) => ({ ...n, read: true }));
      saveList(next);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    saveList([]);
  }, []);

  const dismissToast = useCallback(() => {
    setActiveToast(null);
  }, []);

  // Supabase 실시간 이벤트 구독 (주문 상태 변경 감지)
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`realtime-notifications-${user.uid}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'service_orders',
        },
        (payload) => {
          const newOrder = payload.new as { id: string; category_id: string; address: string };
          addNotification({
            type: 'order_created',
            title: locale === 'vi' ? '⚡ Có đơn hàng mới tại Hà Nội!' : locale === 'en' ? '⚡ New job request nearby!' : '⚡ 새로운 수리 일감이 등록되었습니다!',
            body: `${newOrder.address || 'Hà Nội'} · ${locale === 'vi' ? 'Nhận việc ngay' : '지금 확인하세요'}`,
            link: `/${locale}/technician/order/${newOrder.id}`,
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'service_orders',
          filter: `customer_uid=eq.${user.uid}`,
        },
        (payload) => {
          const updated = payload.new as { id: string; status: string; technician_uid: string | null };
          if (updated.status === 'in_progress' || updated.technician_uid) {
            addNotification({
              type: 'tech_dispatched',
              title: locale === 'vi' ? '🚗 Kỹ thuật viên đang đến!' : locale === 'en' ? '🚗 Technician on the way!' : '🚗 기술자가 고객님 댁으로 출동 중입니다!',
              body: locale === 'vi' ? 'Thợ đã nhận đơn và đang di chuyển. Vui lòng giữ máy.' : '기술자가 배정되어 현장으로 이동하고 있습니다.',
              link: `/${locale}/orders/${updated.id}`,
            });
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, user, locale, addNotification]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return {
    notifications,
    unreadCount,
    activeToast,
    addNotification,
    markAllAsRead,
    clearAll,
    dismissToast,
  };
}
