/**
 * db.ts — Supabase 클라이언트 팩토리
 *
 * ★ 멀티테넌트 보안 설계 포인트:
 *
 * supabaseAdmin (service_role 키)
 *   - RLS(Row Level Security)를 우회한다. 즉 모든 family의 row에 접근 가능.
 *   - 그렇기 때문에 **앱 레이어(tenantPlugin)의 req.familyId 강제 주입이
 *     가족 간 데이터 격리의 유일한 방어선**이다.
 *   - 모든 쿼리에 `.eq('family_id', req.familyId!)` 를 반드시 붙여야 하는 이유.
 *   - autoRefreshToken / persistSession: false — 서버는 세션을 유지하지 않으므로
 *     Supabase SDK의 세션 관리 오버헤드를 끈다.
 *
 * supabaseForUser (anon 키 + 사용자 JWT 위임)
 *   - 사용자의 JWT를 Authorization 헤더에 실어 Supabase에 전달하면
 *     Supabase가 해당 사용자의 RLS 정책을 그대로 적용한다.
 *   - 현재 코드베이스에서는 **미사용** — 모든 라우트가 supabaseAdmin을 쓴다.
 *   - 향후 RLS를 앱 레이어 격리 대신 DB 레이어에서 처리하고 싶을 때를 위해 보존.
 */
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
