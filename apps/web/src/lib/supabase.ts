/**
 * lib/supabase.ts — Supabase 클라이언트 싱글톤
 *
 * persistSession: true — 새로고침 후에도 로그인 유지 (localStorage에 세션 저장).
 * autoRefreshToken: true — JWT 만료 전 자동 갱신. 앱이 백그라운드에서 돌아와도 세션 유지.
 *
 * Preview 모드에서는 이 클라이언트를 호출하지 않는다 (api()가 먼저 분기).
 * App.tsx의 onAuthStateChange 구독만 이 모듈을 직접 사용한다.
 */
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  console.error('VITE_SUPABASE_URL 또는 VITE_SUPABASE_ANON_KEY 누락 — .env 확인');
}

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});
