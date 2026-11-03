'use client';
import { useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

export interface WalletBalances {
  pointBalanceVnd: number;
  pointBalance: number;
  btBalance: number;
}

export function useAuthState() {
  const [user, setUser] = useState<User | null>(null);
  const [wallets, setWallets] = useState<WalletBalances | null>(null);
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

  return { user, wallets, authLoading };
}
