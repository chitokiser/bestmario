'use client';
import { useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { createSupabaseClient } from '@/lib/supabase';
import type { UserRole } from '@/types/supabase';

export interface WalletBalances {
  pointBalanceVnd: number;
  pointBalance: number;
  btBalance: number;
}

export function useAuthState() {
  const [user, setUser] = useState<User | null>(null);
  const [wallets, setWallets] = useState<WalletBalances | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);

      if (!u) {
        setWallets(null);
      }
    });

    return unsubAuth;
  }, []);

  useEffect(() => {
    if (!user) return;

    const ref = doc(db, 'users', user.uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setWallets({
            pointBalanceVnd: data.pointBalanceVnd ?? data.bmBalance ?? 0,
            pointBalance: data.pointBalance ?? 0,
            btBalance: data.btBalance ?? 0,
          });
        }
      },
      () => {
        // ignore errors reading wallet — non-critical
      }
    );

    return unsub;
  }, [user]);

  // role 은 Supabase users 테이블에서 읽는다. RLS 가 이 값을 기준으로 동작하고,
  // Firebase 프로젝트는 BestClub 과 공유하므로 users 문서에 BestMario 전용
  // role 필드를 추가하지 않는다.
  useEffect(() => {
    if (!user) {
      setRole(null);
      setRoleLoading(false);
      return;
    }

    let cancelled = false;
    setRoleLoading(true);

    (async () => {
      try {
        const idToken = await user.getIdToken();
        const supabase = createSupabaseClient(idToken);
        const { data } = await supabase
          .from('users')
          .select('role')
          .eq('uid', user.uid)
          .maybeSingle();
        if (!cancelled) setRole((data?.role ?? null) as UserRole | null);
      } catch {
        if (!cancelled) setRole(null);
      } finally {
        if (!cancelled) setRoleLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [user]);

  return { user, wallets, role, roleLoading, authLoading };
}
