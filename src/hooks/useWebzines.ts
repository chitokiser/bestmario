'use client';
import { useEffect, useState } from 'react';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface Webzine {
  id: string;
  title: string;
  summary?: string;
  thumbnail_url?: string;
  published_at?: { seconds: number };
  merchant_id?: string;
  tags?: string[];
}

export function useWebzines(merchantId: string | undefined, count = 3) {
  const [webzines, setWebzines] = useState<Webzine[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load platform-wide webzines; filter by merchant if available
    const constraints = merchantId
      ? [where('merchant_id', '==', merchantId), where('status', '==', 'published')]
      : [where('status', '==', 'published')];

    const q = query(
      collection(db, 'webzines'),
      ...constraints,
      orderBy('published_at', 'desc'),
      limit(count)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setWebzines(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Webzine, 'id'>) })));
        setLoading(false);
      },
      () => {
        setLoading(false);
      }
    );

    return unsub;
  }, [merchantId, count]);

  return { webzines, loading };
}
