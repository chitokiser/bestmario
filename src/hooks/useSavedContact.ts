'use client';
import { useEffect, useState } from 'react';
import { useSupabase } from '@/hooks/useSupabase';
import { useAuthState } from '@/hooks/useAuthState';

/**
 * 이전에 입력한 연락처(계정에 저장)와 가장 최근 주문의 주소.
 * 주문 폼을 열 때 빈 칸을 미리 채워 같은 정보를 다시 입력하지 않게 한다.
 */
export function useSavedContact(): { phone: string; address: string } {
  const supabase = useSupabase();
  const { user } = useAuthState();
  const uid = user?.uid;
  const [saved, setSaved] = useState({ phone: '', address: '' });

  useEffect(() => {
    if (!uid) {
      setSaved({ phone: '', address: '' });
      return;
    }
    let alive = true;
    void Promise.all([
      supabase.from('users').select('phone').eq('uid', uid).maybeSingle(),
      supabase
        .from('service_orders')
        .select('address')
        .eq('customer_uid', uid)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]).then(([u, o]) => {
      if (!alive) return;
      setSaved({
        phone: (u.data?.phone as string | undefined) ?? '',
        address: (o.data?.address as string | undefined) ?? '',
      });
    });
    return () => {
      alive = false;
    };
  }, [supabase, uid]);

  return saved;
}
