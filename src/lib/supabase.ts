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
/** Supabase 환경변수가 설정되었는지 */
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// 미설정 시 던지지 않는다. 훅이 렌더 중에 클라이언트를 만들기 때문에, 던지면
// Supabase 를 붙이기 전에도 랜딩 페이지까지 500 이 된다. 대신 더미 주소로
// 만들어 두고 쿼리 단계에서 네트워크 오류로 드러나게 한다.
const FALLBACK_URL = 'https://supabase-not-configured.invalid';
const FALLBACK_KEY = 'not-configured';

let warned = false;
function warnOnce() {
  if (warned) return;
  warned = true;
  console.error(
    '[supabase] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 가 설정되지 않았습니다. 주문·결제 기능이 동작하지 않습니다.'
  );
}

export function createSupabaseClient(idToken?: string): SupabaseClient {
  if (!isSupabaseConfigured) warnOnce();

  const url = isSupabaseConfigured ? SUPABASE_URL : FALLBACK_URL;
  const key = isSupabaseConfigured ? SUPABASE_ANON_KEY : FALLBACK_KEY;

  if (!idToken) {
    return createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return createClient(url, key, {
    accessToken: async () => idToken,
  });
}
