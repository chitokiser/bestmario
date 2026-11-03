'use client';
import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface MerchantProfile {
  name: string;
  description?: string;
  logoUrl?: string;
  coverUrl?: string;
  btPerVnd?: number;
  btBalance?: number;
  ownerUid?: string;
  ownerEmail?: string;
  pendingSettlementVnd?: number;
  feeBps?: number;
}

export function useMerchant(merchantId: string | undefined) {
  const [merchant, setMerchant] = useState<MerchantProfile | null>(null);
  const [loading, setLoading] = useState(!!merchantId);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!merchantId) {
      setLoading(false);
      return;
    }

    const ref = doc(db, 'merchants', merchantId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setMerchant(snap.exists() ? (snap.data() as MerchantProfile) : null);
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );

    return unsub;
  }, [merchantId]);

  return { merchant, loading, error };
}
