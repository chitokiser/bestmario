'use client';

import { useEffect } from 'react';
import { useSupabase } from '@/hooks/useSupabase';
import { useAuthState } from '@/hooks/useAuthState';

/**
 * 로그인한 계정의 이메일을 users 에 맞춰 둔다. 운영자가 BT 를 보낼 때 BestClub 이
 * 고객을 이메일로 찾기 때문이다. 이미 같은 값이면 아무것도 쓰지 않는다.
 */
export function useSyncEmail() {
  const supabase = useSupabase();
  const { user } = useAuthState();
  const uid = user?.uid;
  const email = user?.email ?? '';

  useEffect(() => {
    if (!uid || !email) return;
    void supabase.from('users').update({ email }).eq('uid', uid).neq('email', email);
  }, [supabase, uid, email]);
}
