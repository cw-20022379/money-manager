/**
 * routes/healthz.ts — 헬스체크 엔드포인트
 *
 * GET /healthz: 서버 및 DB 연결 상태를 반환한다.
 *
 * 설계 포인트:
 *   - /api/* 가 아닌 /healthz로 경로를 잡아 authPlugin이 적용되지 않는다.
 *     인증 없이 로드밸런서/Render/k8s가 헬스를 확인할 수 있어야 하기 때문.
 *   - DB 연결 확인은 families 테이블에서 1건만 select — 실제 데이터보다는
 *     연결이 살아있는지만 확인하면 충분하다.
 *   - DB 오류가 있어도 500이 아닌 200으로 응답하고 ok: false를 반환한다.
 *     로드밸런서가 헬스체크 실패로 인스턴스를 교체하는 것보다 앱 자체가 오류를
 *     보고하는 쪽이 디버깅에 더 유용한 경우가 있기 때문.
 *     (정책에 따라 DB 오류 시 500을 반환하도록 변경할 수도 있다)
 */
import type { FastifyPluginAsync } from 'fastify';
import { supabaseAdmin } from '../db.js';

export const healthzRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/healthz', async () => {
    const { error } = await supabaseAdmin.from('families').select('id').limit(1);
    return {
      ok: !error,
      time: new Date().toISOString(),
      db: error ? `error: ${error.message}` : 'ok',
    };
  });
};
