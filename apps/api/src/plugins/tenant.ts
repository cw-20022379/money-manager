/**
 * plugins/tenant.ts — 멀티테넌트 격리 플러그인 (파이프라인 2단계)
 *
 * 역할: req.user.id로 가족을 조회해 req.familyId를 주입한다.
 *       이후 모든 라우트는 req.familyId를 신뢰하고 `.eq('family_id', req.familyId!)`를 붙인다.
 *
 * ★ 핵심 보안 설계:
 *   supabaseAdmin은 service_role이므로 RLS를 우회한다.
 *   따라서 이 플러그인이 req.familyId를 올바르게 주입하는 것이
 *   **가족 A가 가족 B의 데이터를 볼 수 없게 막는 유일한 앱 레이어 방어선**이다.
 *   라우트에서 .eq('family_id', ...) 조건을 빠뜨리는 순간 데이터가 노출된다.
 *
 * /api/families 예외:
 *   가족 생성(POST /api/families) 또는 초대 토큰으로 합류(POST /api/families/join)는
 *   아직 membership이 없는 사용자도 호출해야 한다. memberships 조회가 실패하면
 *   403을 반환하므로 해당 prefix 전체를 tenant 검사에서 제외한다.
 *   (/api/families/invite는 내부에서 별도로 lookup 수행)
 *
 * last_seen_at debounce(5분):
 *   Co-view 기능을 위해 구성원의 마지막 접속 시각을 기록한다.
 *   매 요청마다 UPDATE하면 DB 부하가 크므로 5분 간격으로 throttle.
 *   void로 fire-and-forget — 실패해도 요청 응답에는 영향 없다.
 */
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { supabaseAdmin } from '../db.js';

/**
 * req.user.id로 memberships를 조회해 req.familyId를 주입.
 * 또한 memberships.last_seen_at을 debounce(5분) 갱신 (P1: Co-view 측정).
 *
 * /api/families/* 의 가족 생성·합류 라우트는 family_id가 아직 없을 수 있어 제외.
 */
export const tenantPlugin: FastifyPluginAsync = fp(async (fastify) => {
  fastify.addHook('preHandler', async (req, reply) => {
    if (!req.user) return;
    if (req.url.startsWith('/api/families')) return; // 가족 생성/합류는 가족 없는 상태 허용

    const { data, error } = await supabaseAdmin
      .from('memberships')
      .select('family_id, last_seen_at')
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (error) {
      req.log.error({ err: error }, 'tenant lookup failed');
      return reply.code(500).send({ error: 'TENANT_LOOKUP_FAILED' });
    }
    if (!data) {
      // 인증은 됐지만 가족이 없는 상태 → 가족 생성 화면으로 유도
      return reply.code(403).send({ error: 'NO_FAMILY' });
    }

    req.familyId = data.family_id;

    // P1: Co-view 측정 - 5분 debounce
    // 5분이 지나지 않았으면 UPDATE를 건너뜀 (DB 부하 절감)
    const last = data.last_seen_at ? new Date(data.last_seen_at).getTime() : 0;
    if (Date.now() - last > 5 * 60_000) {
      void supabaseAdmin
        .from('memberships')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('user_id', req.user.id);
    }
  });
});
