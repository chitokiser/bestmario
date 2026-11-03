'use client';
import { useCallback, useEffect, useState } from 'react';
import { useSupabase } from '@/hooks/useSupabase';
import { useAuthState } from '@/hooks/useAuthState';
import type { ServiceOrder, TechnicianProfile } from '@/types/supabase';

const REJECTED_KEY = 'bestmario:rejectedOrders';

function readRejected(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(window.localStorage.getItem(REJECTED_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

/**
 * 기술자용 주문 목록 + 작업 진행 액션.
 *
 * `pendingOrders` 는 미배정 대기 주문 중 본인 skills 에 해당하는 것만,
 * `myOrders` 는 본인에게 배정된 주문이다. 둘 다 Realtime 으로 갱신된다.
 *
 * 거절은 주문 상태를 바꾸지 않는다 — 다른 기술자가 수락할 수 있어야 하므로
 * 본인 목록에서만 숨기고 localStorage 에 기억한다.
 */
export function useTechnicianOrders() {
  const supabase = useSupabase();
  const { user } = useAuthState();
  const uid = user?.uid;

  const [profile, setProfile] = useState<TechnicianProfile | null>(null);
  const [pendingOrders, setPendingOrders] = useState<ServiceOrder[]>([]);
  const [myOrders, setMyOrders] = useState<ServiceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rejected, setRejected] = useState<string[]>(readRejected);

  const fetchAll = useCallback(async () => {
    if (!uid) {
      setProfile(null);
      setPendingOrders([]);
      setMyOrders([]);
      setLoading(false);
      return;
    }
    setLoading(true);

    const { data: profRow, error: profErr } = await supabase
      .from('technician_profiles')
      .select('*')
      .eq('uid', uid)
      .maybeSingle();

    if (profErr) {
      setError(profErr.message);
      setLoading(false);
      return;
    }

    const prof = (profRow ?? null) as TechnicianProfile | null;
    setProfile(prof);

    const skills = prof?.skills ?? [];

    const [open, mine] = await Promise.all([
      skills.length > 0
        ? supabase
            .from('service_orders')
            .select('*')
            .eq('status', 'pending')
            .is('technician_uid', null)
            .in('category_id', skills)
            .order('scheduled_at', { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from('service_orders')
        .select('*')
        .eq('technician_uid', uid)
        .order('scheduled_at', { ascending: true }),
    ]);

    setError(open.error?.message ?? mine.error?.message ?? null);
    setPendingOrders((open.data ?? []) as ServiceOrder[]);
    setMyOrders((mine.data ?? []) as ServiceOrder[]);
    setLoading(false);
  }, [supabase, uid]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (!uid) return;

    const channel = supabase
      .channel(`tech-orders-${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_orders' }, () =>
        void fetchAll()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, uid, fetchAll]);

  const acceptOrder = useCallback(
    async (orderId: string): Promise<void> => {
      if (!uid) throw new Error('로그인이 필요합니다');

      // 선점 경쟁: status/technician_uid 조건을 걸어 먼저 수락한 기술자만 성공한다
      const { data, error: err } = await supabase
        .from('service_orders')
        .update({ technician_uid: uid, status: 'assigned' })
        .eq('id', orderId)
        .eq('status', 'pending')
        .is('technician_uid', null)
        .select('id');

      if (err) throw new Error(err.message);
      if (!data || data.length === 0) {
        throw new Error('이미 다른 기술자가 수락한 주문입니다');
      }

      await fetchAll();
    },
    [supabase, uid, fetchAll]
  );

  const rejectOrder = useCallback(async (orderId: string): Promise<void> => {
    setRejected((prev) => {
      const next = prev.includes(orderId) ? prev : [...prev, orderId];
      try {
        window.localStorage.setItem(REJECTED_KEY, JSON.stringify(next));
      } catch {
        // 저장 실패는 무시 — 이번 세션에서만 숨겨진다
      }
      return next;
    });
  }, []);

  const startWork = useCallback(
    async (orderId: string): Promise<void> => {
      const { error: err } = await supabase
        .from('service_orders')
        .update({ status: 'in_progress' })
        .eq('id', orderId)
        .eq('status', 'assigned');

      if (err) throw new Error(err.message);
      await fetchAll();
    },
    [supabase, fetchAll]
  );

  /** order-photos 버킷에 업로드하고 공개 URL 목록을 돌려준다. 경로는 "<orderId>/..." 고정 */
  const uploadPhotos = useCallback(
    async (orderId: string, files: File[]): Promise<string[]> => {
      const urls: string[] = [];

      for (const file of files) {
        const ext = file.name.split('.').pop() ?? 'jpg';
        const path = `${orderId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

        const { error: upErr } = await supabase.storage
          .from('order-photos')
          .upload(path, file, { contentType: file.type, upsert: false });

        if (upErr) throw new Error(upErr.message);

        const { data } = supabase.storage.from('order-photos').getPublicUrl(path);
        urls.push(data.publicUrl);
      }

      return urls;
    },
    [supabase]
  );

  /** 완료 요청: 사진만 저장하고 status 는 in_progress 로 둔다 — 고객 승인이 완료 전환을 한다 */
  const completeWork = useCallback(
    async (orderId: string, photosAfter: string[]): Promise<void> => {
      const { error: err } = await supabase
        .from('service_orders')
        .update({ photos_after: photosAfter })
        .eq('id', orderId);

      if (err) throw new Error(err.message);
      await fetchAll();
    },
    [supabase, fetchAll]
  );

  return {
    profile,
    pendingOrders: pendingOrders.filter((o) => !rejected.includes(o.id)),
    myOrders,
    loading,
    error,
    acceptOrder,
    rejectOrder,
    startWork,
    completeWork,
    uploadPhotos,
    refresh: fetchAll,
  };
}
