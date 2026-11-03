'use client';
import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface ServiceProduct {
  id: string;
  name: string;
  description?: string;
  price: number;
  currency?: string;
  images?: string[];
  image_url?: string;
  product_type?: string;
  service_category?: string;
  sale_status?: string;
  display_order?: number;
}

export function useServiceProducts(merchantId: string | undefined) {
  const [products, setProducts] = useState<ServiceProduct[]>([]);
  const [loading, setLoading] = useState(!!merchantId);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!merchantId) {
      setLoading(false);
      return;
    }

    // spec §11: merchant_id in [ID, Number(ID)] && sale_status == 'published'
    // Primary query on string merchantId; numeric variant is handled as fallback
    const q = query(
      collection(db, 'merchant_products'),
      where('merchant_id', '==', merchantId),
      where('sale_status', '==', 'published'),
      orderBy('display_order', 'asc')
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setProducts(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ServiceProduct, 'id'>) }))
        );
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );

    return unsub;
  }, [merchantId]);

  return { products, loading, error };
}
