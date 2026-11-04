'use client';
import { useEffect, useState } from 'react';
import { onIdTokenChanged } from 'firebase/auth';
import { SupabaseClient } from '@supabase/supabase-js';
import { auth } from '@/lib/firebase';
import { createSupabaseClient } from '@/lib/supabase';

// 토큰이 같으면 같은 클라이언트를 재사용한다 — Realtime 채널·커넥션 중복 생성 방지
let cachedToken: string | undefined;
let cachedClient: SupabaseClient | null = null;

function getClient(idToken?: string): SupabaseClient {
  if (!cachedClient || cachedToken !== idToken) {
    cachedToken = idToken;
    cachedClient = createSupabaseClient(idToken);
  }
  return cachedClient;
}

/**
 * Firebase ID 토큰이 적용된 Supabase 클라이언트.
 *
 * `onIdTokenChanged` 를 구독하므로 로그인·로그아웃은 물론 Firebase가 토큰을
 * 갱신할 때마다(기본 1시간) 새 토큰이 반영된다. 로그인 전·토큰 수신 전에는
 * 비인증 클라이언트를 돌려주므로, 이 값을 쓰는 쿼리는 반환된 클라이언트를
 * 의존성에 넣어 토큰 도착 시 재조회해야 한다.
 */
export function useSupabase(): SupabaseClient {
  // 새로 마운트되는 컴포넌트가 비인증(undefined)으로 시작하면 전역 캐시가 비인증 클라이언트로
  // 덮어써져 다른 컴포넌트의 supabase 가 바뀌고, 재조회 → 리마운트가 끝없이 반복된다.
  // 이미 받아 둔 토큰으로 시작해 캐시를 유지한다.
  const [idToken, setIdToken] = useState<string | undefined>(cachedToken);

  useEffect(() => {
    return onIdTokenChanged(auth, async (u) => {
      if (!u) {
        setIdToken(undefined);
        return;
      }
      try {
        setIdToken(await u.getIdToken());
      } catch {
        setIdToken(undefined);
      }
    });
  }, []);

  return getClient(idToken);
}
