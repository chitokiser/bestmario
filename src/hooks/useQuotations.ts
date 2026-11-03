'use client';
import { useCallback, useEffect, useState } from 'react';
import { useSupabase } from '@/hooks/useSupabase';
import { useAuthState } from '@/hooks/useAuthState';
import type { Quotation } from '@/types/supabase';

export interface SubmitQuotationInput {
  order_id: string;
  price: number; // VND
  duration_min: number;
  note?: string;
}

/** technician_public 뷰 — documents 를 제외한 공개 프로필 */
export interface TechnicianPublic {
  uid: string;
  status: string;
  skills: string[];
  rating: number;
  rating_count: number;
  name: string;
}

export interface QuotationWithTechnician extends Quotation {
  technician: TechnicianPublic | null;
}

const MAX_QUOTATIONS_PER_ORDER = 5;

/**
 * 한 주문의 견적 목록 + 제출(기술자) / 선택(고객).
 *
 * 견적 5건 제한과 선택 트랜잭션은 DB 쪽에서도 강제된다
 * (003_functions.sql: enforce_quotation_limit, accept_quotation).
 */
export function useQuotations(orderId: string) {
  const supabase = useSupabase();
  const { user } = useAuthState();
  const uid = user?.uid;

  const [quotations, setQuotations] = useState<QuotationWithTechnician[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchQuotations = useCallback(async () => {
    if (!orderId) {
      setQuotations([]);
      setLoading(false);
      return;
    }
    setLoading(true);

    const { data, error: err } = await supabase
      .from('quotations')
      .select('*')
      .eq('order_id', orderId)
      .order('price', { ascending: true });

    if (err) {
      setError(err.message);
      setQuotations([]);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as Quotation[];
    const uids = [...new Set(rows.map((q) => q.technician_uid))];

    // technician_public 은 뷰라서 FK 조인이 안 된다 — uid 로 따로 조회해 붙인다
    let profiles: TechnicianPublic[] = [];
    if (uids.length > 0) {
      const { data: profData } = await supabase
        .from('technician_public')
        .select('*')
        .in('uid', uids);
      profiles = (profData ?? []) as TechnicianPublic[];
    }

    setError(null);
    setQuotations(
      rows.map((q) => ({
        ...q,
        technician: profiles.find((p) => p.uid === q.technician_uid) ?? null,
      }))
    );
    setLoading(false);
  }, [supabase, orderId]);

  useEffect(() => {
    void fetchQuotations();
  }, [fetchQuotations]);

  useEffect(() => {
    if (!orderId) return;

    const channel = supabase
      .channel(`quotations-${orderId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'quotations', filter: `order_id=eq.${orderId}` },
        () => void fetchQuotations()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, orderId, fetchQuotations]);

  const submitQuotation = useCallback(
    async (input: SubmitQuotationInput): Promise<Quotation> => {
      if (!uid) throw new Error('로그인이 필요합니다');

      const { count, error: countErr } = await supabase
        .from('quotations')
        .select('id', { count: 'exact', head: true })
        .eq('order_id', input.order_id);

      if (countErr) throw new Error(countErr.message);
      if ((count ?? 0) >= MAX_QUOTATIONS_PER_ORDER) {
        throw new Error('이 주문은 이미 견적 5건이 접수되었습니다');
      }

      const { data, error: err } = await supabase
        .from('quotations')
        .insert({
          order_id: input.order_id,
          technician_uid: uid,
          price: input.price,
          duration_min: input.duration_min,
          note: input.note ?? '',
          status: 'submitted',
        })
        .select()
        .single();

      if (err) throw new Error(err.message);

      await fetchQuotations();
      return data as Quotation;
    },
    [supabase, uid, fetchQuotations]
  );

  const acceptQuotation = useCallback(
    async (quotationId: string): Promise<void> => {
      // 선택 견적 accepted / 나머지 rejected / 주문 assigned — 한 트랜잭션
      const { error: err } = await supabase.rpc('accept_quotation', {
        p_quotation_id: quotationId,
      });
      if (err) throw new Error(err.message);
      await fetchQuotations();
    },
    [supabase, fetchQuotations]
  );

  return { quotations, loading, error, submitQuotation, acceptQuotation, refresh: fetchQuotations };
}
