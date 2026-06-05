import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

// 서버 전용 클라이언트 — service_role 키 사용 (RLS 우회)
// 단, 모든 요청은 미들웨어에서 family_id 강제 주입으로 격리됨
export const supabaseAdmin = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { autoRefreshToken: false, persistSession: false },
  },
);

// 사용자 JWT를 위임받아 RLS를 통과하는 클라이언트
// 라우트에서 req.user.token으로 만들어 씀
export function supabaseForUser(jwt: string) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}
