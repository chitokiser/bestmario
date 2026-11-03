'use client';

import { useCallback, useState } from 'react';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth, callMerchantMemberJoin } from '@/lib/firebase';
import { createSupabaseClient } from '@/lib/supabase';

const MERCHANT_ID = process.env.NEXT_PUBLIC_BESTMARIO_MERCHANT_ID || undefined;

/** Google 로그인 + Supabase users 행 생성. 상단 메뉴와 랜딩 CTA 가 함께 쓴다. */
export function useLogin(locale: string) {
  const [joinLoading, setJoinLoading] = useState(false);

  const login = useCallback(async () => {
    try {
      const result = await signInWithPopup(auth, new GoogleAuthProvider());
      if (!result.user) return;

      setJoinLoading(true);
      try {
        // ignoreDuplicates 이므로 재로그인 시 기존 role(technician/admin)을 덮어쓰지 않는다.
        const idToken = await result.user.getIdToken();
        const supabase = createSupabaseClient(idToken);
        const { error } = await supabase.from('users').upsert(
          {
            uid: result.user.uid,
            role: 'customer',
            name: result.user.displayName ?? '',
            phone: result.user.phoneNumber ?? '',
            lang: locale,
            created_at: new Date().toISOString(),
          },
          { onConflict: 'uid', ignoreDuplicates: true }
        );
        if (error) console.error('[supabase] users upsert 실패', error.message);
      } catch (e) {
        // Supabase 저장 실패 — 로그인 자체는 유지한다
        console.error('[supabase] users upsert 예외', e);
      }

      if (MERCHANT_ID) {
        try {
          await callMerchantMemberJoin(MERCHANT_ID);
        } catch {
          // 멘토 지정 실패 무시
        }
      }
      setJoinLoading(false);
    } catch (e) {
      // 팝업을 닫거나 취소한 경우만 조용히 넘기고, 그 외는 사유를 드러낸다.
      const code = (e as { code?: string })?.code ?? 'unknown';
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        console.error('[auth] 로그인 실패', code, e);
        alert(`로그인에 실패했습니다 (${code})`);
      }
    }
  }, [locale]);

  return { login, joinLoading };
}
