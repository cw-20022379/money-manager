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

    const { data, error } = await supabaseAdmin.auth.getUser(jwt);
    if (error || !data.user) {
      return reply.code(401).send({ error: 'INVALID_TOKEN' });
    }

    req.user = { id: data.user.id, email: data.user.email, jwt };
  });
});
