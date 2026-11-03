'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSupabase } from '@/hooks/useSupabase';
import { useAuthState } from '@/hooks/useAuthState';
import type { OrderStatus, OrderType, ServiceOrder } from '@/types/supabase';

export interface CreateOrderInput {
  category_id: string;
  product_id?: string;
  order_type: OrderType;
  address: string;
  scheduled_at: string; // ISO 8601
  note?: string;
  photos_before?: string[];
}

/**
 * 로그인한 고객의 주문 목록 + 생성·상태변경.
 *
 * 목록은 Supabase Realtime 으로 구독하므로 기술자 수락·완료 등
 * 서버 측 상태 변화가 바로 반영된다.
 */
export function useOrders() {
  const supabase = useSupabase();
  const { user, authLoading } = useAuthState();
  const uid = user?.uid;

  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // state 업데이트는 비동기라 같은 tick 의 두 번째 클릭을 막지 못한다 — ref 로 잠근다
  const submitLock = useRef(false);

  const fetchOrders = useCallback(async () => {
    if (!uid) {
      setOrders([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: err } = await supabase
      .from('service_orders')
      .select('*')
      .eq('customer_uid', uid)
      .order('created_at', { ascending: false });

    if (err) {
      setError(err.message);
      setOrders([]);
    } else {
      setError(null);
      setOrders((data ?? []) as ServiceOrder[]);
    }
    setLoading(false);
  }, [supabase, uid]);

  useEffect(() => {
    if (authLoading) return;
    void fetchOrders();
  }, [authLoading, fetchOrders]);

  useEffect(() => {
    if (!uid) return;

    const channel = supabase
      .channel(`orders-${uid}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'service_orders',
          filter: `customer_uid=eq.${uid}`,
        },
        () => void fetchOrders()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, uid, fetchOrders]);

  const createOrder = useCallback(
    async (input: CreateOrderInput): Promise<ServiceOrder> => {
      if (submitLock.current) {
        throw new Error('이미 주문을 제출하는 중입니다');
      }
      if (!uid) {
        throw new Error('로그인이 필요합니다');
      }

      submitLock.current = true;
      setSubmitting(true);
      try {
        const { data, error: err } = await supabase
          .from('service_orders')
          .insert({
            customer_uid: uid,
            category_id: input.category_id,
            product_id: input.product_id ?? null,
            order_type: input.order_type,
            status: 'pending',
            address: input.address,
            scheduled_at: input.scheduled_at,
            photos_before: input.photos_before ?? [],
            note: input.note ?? '',
          })
          .select()
          .single();

        if (err) throw new Error(err.message);

        const order = data as ServiceOrder;
        setOrders((prev) => [order, ...prev]);
        return order;
      } finally {
        submitLock.current = false;
        setSubmitting(false);
      }
    },
    [supabase, uid]
  );

  const updateOrderStatus = useCallback(
    async (id: string, status: OrderStatus): Promise<void> => {
      const { error: err } = await supabase
        .from('service_orders')
        .update({ status })
        .eq('id', id);

      if (err) throw new Error(err.message);

      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
    },
    [supabase]
  );

  return { orders, loading, submitting, error, createOrder, updateOrderStatus, refresh: fetchOrders };
}
