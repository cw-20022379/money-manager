/**
 * routes/me.ts — 현재 로그인 사용자 정보 라우트
 *
 * GET /api/me: 인증 상태와 membership 정보를 반환한다.
 *
 * 설계 포인트:
 *   - 미인증(req.user가 없으면) 403이 아닌 { authenticated: false }를 반환한다.
 *     이유: /api/me는 "내가 누구인지 확인"하는 용도이므로 인증 실패를 에러로 처리하지 않고
 *           클라이언트가 로그인 화면으로 리다이렉트할지 판단할 수 있도록 정보를 준다.
 *   - membership이 없어도 authenticated: true를 반환할 수 있다.
 *     이유: 가입 직후 아직 가족을 만들지 않은 상태 → 가족 생성 화면으로 안내.
 *   - lookup_error를 응답에 포함: DB 오류 시에도 200으로 반환하고 에러 이유를 클라이언트에 전달.
 *     디버깅 편의를 위해 null 대신 오류 메시지를 노출한다.
 */
import type { FastifyPluginAsync } from 'fastify';
import { supabaseAdmin } from '../db.js';

export const meRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/me', async (req) => {
    if (!req.user) return { authenticated: false };
    const { data, error } = await supabaseAdmin
      .from('memberships')
      .select('family_id, display_name, role, last_seen_at')
      .eq('user_id', req.user.id)
      .maybeSingle();
    return {
      authenticated: true,
      user_id: req.user.id,
      email: req.user.email,
      // membership이 null이면 가족 미생성 상태 (authenticated는 여전히 true)
      membership: data ?? null,
      lookup_error: error?.message,
    };
  });
};
