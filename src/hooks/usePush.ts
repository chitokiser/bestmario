'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSupabase } from '@/hooks/useSupabase';
import { useAuthState } from '@/hooks/useAuthState';

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

export type PushState = 'unsupported' | 'denied' | 'off' | 'on' | 'loading';

function toKey(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** 이 기기의 웹 푸시 구독 상태와 켜기/끄기. */
export function usePush() {
  const supabase = useSupabase();
  const { user } = useAuthState();
  const [state, setState] = useState<PushState>('loading');
  const [error, setError] = useState<string | null>(null);

  const supported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    VAPID_PUBLIC !== '';

  useEffect(() => {
    if (!supported) {
      setState('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setState('denied');
      return;
    }
    let cancelled = false;
    void navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (!cancelled) setState(sub ? 'on' : 'off');
      })
      .catch(() => {
        if (!cancelled) setState('unsupported');
      });
    return () => {
      cancelled = true;
    };
  }, [supported]);

  const enable = useCallback(async () => {
    if (!user || !supported) return;
    setError(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setState(perm === 'denied' ? 'denied' : 'off');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(VAPID_PUBLIC) }));
      const j = sub.toJSON();
      const { error: err } = await supabase.from('push_subscriptions').upsert(
        { uid: user.uid, endpoint: sub.endpoint, p256dh: j.keys?.p256dh ?? '', auth: j.keys?.auth ?? '' },
        { onConflict: 'endpoint', ignoreDuplicates: true }
      );
      if (err) throw new Error(err.message);
      setState('on');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [supabase, supported, user]);

  const disable = useCallback(async () => {
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        await sub.unsubscribe();
      }
      setState('off');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [supabase]);

  return { state, error, enable, disable };
}
