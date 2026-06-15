/**
 * plugins/reason.ts — 변경 사유 강제 플러그인 (파이프라인 3단계)
 *
 * 역할: PATCH / DELETE 요청에 X-Reason-Code 헤더가 있는지 검증한다.
 *
 * 왜 사유 코드가 필요한가:
 *   부부가 함께 사용하는 앱에서 "왜 이걸 바꿨나"를 구분하는 것은 중요하다.
 *   - LIFE_EVENT: 의도적 변경 (구독 해지, 가격 변경 등) → 배우자에게 알림 전송.
 *   - CORRECTION: 실수 수정 (금액 오입력 등) → 조용히 기록만 남김, 알림 없음.
 *   클라이언트가 이 헤더를 보내지 않으면 422로 차단 → 프론트엔드 개발 시
 *   사유 선택 UI를 빠뜨리는 실수를 빠르게 발견할 수 있다.
 *
 * POST 제외 이유:
 *   신규 등록(POST)은 항상 LIFE_EVENT로 자동 처리 → 라우트 내에서 하드코딩.
 *   클라이언트가 사유를 명시할 필요 없음.
 *
 * 면제 예외:
 *   - /api/notifications/rules: 개인 알림 설정 변경은 가족에 알릴 이유 없음.
 *   - /api/notifications/push: 구독 해제(DELETE)는 멱등 관리 작업이라 사유 불필요.
 */
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
