import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

/**
 * Mutation (PATCH/DELETE)에는 X-Reason-Code 헤더가 필수.
 * 누락 시 422.
 * 값: LIFE_EVENT | CORRECTION (v0.1.1 freeze)
 *
 * POST(생성)는 자동 LIFE_EVENT 처리 → 사유 헤더 없어도 OK.
 */
export const reasonPlugin: FastifyPluginAsync = fp(async (fastify) => {
  fastify.addHook('preValidation', async (req, reply) => {
    if (!['PATCH', 'DELETE'].includes(req.method)) return;
    if (!req.url.startsWith('/api/')) return;

    // 알림 설정 등 일부는 사유 면제
    if (req.url.startsWith('/api/notifications/rules')) return;
    if (req.url.startsWith('/api/notifications/push')) return;

    const reason = req.headers['x-reason-code'];
    if (reason !== 'LIFE_EVENT' && reason !== 'CORRECTION') {
      return reply.code(422).send({
        error: 'REASON_CODE_REQUIRED',
        allowed: ['LIFE_EVENT', 'CORRECTION'],
      });
    }
  });
});
