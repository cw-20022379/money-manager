/**
 * plugins/auth.ts — JWT 인증 플러그인 (파이프라인 1단계)
 *
 * 역할: 모든 /api/* 요청에 대해 Supabase JWT를 검증하고 req.user를 주입한다.
 *
 * 파이프라인에서 가장 먼저 실행되어야 하는 이유:
 *  - tenantPlugin이 req.user.id로 memberships를 조회하므로
 *    auth가 먼저 완료되지 않으면 tenant 조회 자체가 불가능하다.
 *
 * 구현 선택:
 *  - supabaseAdmin.auth.getUser(jwt): service_role로 JWT를 서버 측에서 검증.
 *    클라이언트 SDK를 사용하지 않아도 Supabase Auth 토큰을 안전하게 검증할 수 있다.
 *  - /healthz는 /api/*에 해당하지 않으므로 인증 없이 통과 (헬스체크용).
 *  - 검증 성공 시 req.user = { id, email, jwt } 주입.
 *    jwt를 함께 저장하는 이유: 추후 supabaseForUser(jwt) 호출 시 재사용 가능.
 */
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { supabaseAdmin } from '../db.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: { id: string; email?: string; jwt: string };
    familyId?: string;
  }
}

/**
 * Supabase JWT를 검증해 req.user에 user_id를 주입한다.
 * 모든 /api/* 라우트에 적용 (/healthz는 제외).
 */
export const authPlugin: FastifyPluginAsync = fp(async (fastify) => {
  fastify.addHook('preHandler', async (req, reply) => {
    if (!req.url.startsWith('/api/')) return;

    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'MISSING_BEARER' });
    }
    const jwt = header.slice('Bearer '.length);

    // supabaseAdmin으로 토큰을 검증한다 — 클라이언트 SDK 없이도
    // 서버에서 Supabase Auth의 토큰 서명·만료를 확인할 수 있다.
    const { data, error } = await supabaseAdmin.auth.getUser(jwt);
    if (error || !data.user) {
      return reply.code(401).send({ error: 'INVALID_TOKEN' });
    }

    req.user = { id: data.user.id, email: data.user.email, jwt };
  });
});
