/**
 * plugins/optimistic-lock.ts — 낙관적 잠금(Optimistic Lock) 플러그인 (파이프라인 4단계)
 *
 * 역할: PATCH / DELETE 요청의 If-Match 헤더를 파싱해 req.expectedVersion에 주입한다.
 *
 * 왜 낙관적 잠금이 필요한가:
 *   부부가 동시에 같은 정기지출 항목을 열어 각자 수정하는 상황을 생각하자.
 *   - 남편이 금액을 1만원으로 수정 후 저장.
 *   - 아내가 그 직전 화면(금액 5만원)을 보고 있다가 메모만 수정해 저장.
 *   → 아내의 저장이 남편의 변경을 덮어써 버린다 (Last-Write-Wins 문제).
 *
 *   낙관적 잠금으로 이를 방지:
 *   1. 클라이언트는 데이터를 읽을 때 version 값을 함께 받는다.
 *   2. 수정 시 If-Match: <version> 헤더로 "내가 본 버전"을 서버에 전달.
 *   3. 서버는 UPDATE ... WHERE version = expectedVersion 으로 실행.
 *   4. 다른 사람이 먼저 수정해 version이 달라졌다면 rowCount = 0 → 409 VERSION_CONFLICT.
 *   5. 클라이언트는 409를 받으면 데이터를 다시 불러와 재시도한다.
 *
 * 면제 항목:
 *   - /api/notifications/push: 구독 등록/해제는 멱등 작업이고 충돌 개념이 없음.
 *   - /api/families/*: 구성원 내보내기는 단순 삭제라 version 관리 불필요.
 *
 * 헤더가 없거나 정수가 아니면 428 Precondition Required로 거부.
 * (If-Match 헤더가 필요하다는 HTTP 표준 상태코드)
 */
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
    // 라우트 핸들러에서 `.eq('version', req.expectedVersion!)` 조건으로 사용
    req.expectedVersion = parsed;
  });
});
