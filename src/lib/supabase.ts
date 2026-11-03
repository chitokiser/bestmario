import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

/**
 * Supabase 브라우저 클라이언트 팩토리.
 *
 * 인증은 Firebase Auth가 담당한다. Firebase ID 토큰을 `accessToken` 으로 넘기면
 * Supabase가 Third Party Auth(Firebase)로 검증하고 RLS의 `auth.uid()` 가
 * Firebase uid(`sub` claim)로 매핑된다.
 *
 * `global.headers` 대신 `accessToken` 을 쓰는 이유: 헤더 방식은 PostgREST 요청에만
 * 적용되고 Realtime 채널은 인증되지 않는다.
 *
 * @param idToken Firebase ID 토큰. 없으면 비인증(anon) 클라이언트.
 */
export function createSupabaseClient(idToken?: string): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 환경변수가 설정되지 않았습니다.'
    );
  }

  if (!idToken) {
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    accessToken: async () => idToken,
  });
}
