import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

declare module 'fastify' {
  interface FastifyRequest {
    expectedVersion?: number;
  }
}

/**
 * P4: PATCH/DELETE에 If-Match: <version> 헤더 필수.
 * 누락 시 428. UPDATE 쿼리에서 WHERE version=? 적용 후 rowCount 0이면 409.
 *
 * notification_rules는 P4에서 version 추가 + 면제 화이트리스트 제거.
 * /api/families/*, /api/notifications/push 는 단순 멱등 endpoint라 면제.
 */
export const optimisticLockPlugin: FastifyPluginAsync = fp(async (fastify) => {
  fastify.addHook('preValidation', async (req, reply) => {
    if (!['PATCH', 'DELETE'].includes(req.method)) return;
    if (!req.url.startsWith('/api/')) return;
    if (req.url.startsWith('/api/notifications/push')) return;
    if (req.url.startsWith('/api/families')) return;

    const v = req.headers['if-match'];
    if (typeof v !== 'string') {
      return reply.code(428).send({ error: 'IF_MATCH_REQUIRED' });
    }
    const parsed = parseInt(v, 10);
    if (!Number.isFinite(parsed)) {
      return reply.code(428).send({ error: 'IF_MATCH_INVALID' });
    }
    req.expectedVersion = parsed;
  });
});
