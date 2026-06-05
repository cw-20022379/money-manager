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
      return reply.code(403).send({ error: 'NO_FAMILY' });
    }

    req.familyId = data.family_id;

    // P1: Co-view 측정 - 5분 debounce
    const last = data.last_seen_at ? new Date(data.last_seen_at).getTime() : 0;
    if (Date.now() - last > 5 * 60_000) {
      void supabaseAdmin
        .from('memberships')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('user_id', req.user.id);
    }
  });
});
