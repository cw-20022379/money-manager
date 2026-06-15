/**
 * server.ts — Fastify 앱 진입점
 *
 * 플러그인 등록 순서가 곧 요청 파이프라인이다. 순서를 바꾸면 보안·기능이 무너진다.
 *
 * ┌─ 요청 파이프라인 ────────────────────────────────────────────────────────┐
 * │ 1. CORS         — 브라우저 preflight 허용. credentials: true는 쿠키/Authorization  │
 * │                   헤더 전달에 필요 (PWA ↔ API 동일 도메인이 아닌 경우).             │
 * │ 2. sensible     — reply.notFound() 등 RFC 준수 오류 헬퍼 추가.                     │
 * │ 3. authPlugin   — JWT 검증 → req.user 주입.                                        │
 * │                   ★ 이 단계가 먼저여야 tenant가 req.user.id로 가족을 조회할 수 있다. │
 * │ 4. tenantPlugin — memberships 조회 → req.familyId 주입 + last_seen_at 갱신.        │
 * │                   ★ 멀티테넌트 격리의 유일한 앱 레이어 방어선.                       │
 * │ 5. reasonPlugin — PATCH/DELETE에 X-Reason-Code 헤더 강제 (LIFE_EVENT|CORRECTION).  │
 * │                   ★ auth·tenant 뒤여야 /api/* 라우트만 체크 가능.                   │
 * │ 6. optimisticLockPlugin — If-Match: <version> 파싱 → req.expectedVersion 주입.     │
 * │                   ★ 부부 동시 수정 충돌 방지. reason 뒤 순서 무방하나 함께 묶임.    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * 에러 핸들러: validation 오류(Zod/JSON Schema)는 400으로 통일.
 * 나머지 예외는 500. err.validation 필드는 Fastify가 자동 채운다.
 */
import Fastify, { type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import { env, corsOrigins } from './env.js';
import { authPlugin } from './plugins/auth.js';
import { tenantPlugin } from './plugins/tenant.js';
import { reasonPlugin } from './plugins/reason.js';
import { optimisticLockPlugin } from './plugins/optimistic-lock.js';
import { healthzRoutes } from './routes/healthz.js';
import { meRoutes } from './routes/me.js';
import { familyRoutes } from './routes/families.js';
import { accountRoutes } from './routes/accounts.js';
import { cardRoutes } from './routes/cards.js';
import { flowRoutes } from './routes/flows.js';
import { graphRoutes } from './routes/graph.js';
import { historyRoutes } from './routes/history.js';
import { notificationRoutes } from './routes/notifications.js';

const app = Fastify({
  logger: { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } } },
});

await app.register(cors, {
  origin: corsOrigins,
  credentials: true,
});
await app.register(sensible);
// ── 전역 미들웨어 (순서 중요: auth → tenant → reason → optimisticLock) ──
await app.register(authPlugin);
await app.register(tenantPlugin);
await app.register(reasonPlugin);
await app.register(optimisticLockPlugin);

// ── 라우트 등록 (순서 무관, 플러그인 완료 후) ──
await app.register(healthzRoutes);
await app.register(meRoutes);
await app.register(familyRoutes);
await app.register(accountRoutes);
await app.register(cardRoutes);
await app.register(flowRoutes);
await app.register(graphRoutes);
await app.register(historyRoutes);
await app.register(notificationRoutes);

// Fastify 기본 에러 핸들러를 덮어써서 응답 형식을 통일한다.
// err.validation이 있으면 Zod/JSON Schema 검증 실패 → 400 VALIDATION.
// 그 외 모든 처리되지 않은 예외 → 500 INTERNAL.
app.setErrorHandler((err: FastifyError, _req, reply) => {
  app.log.error({ err }, 'unhandled');
  if (err.validation) return reply.code(400).send({ error: 'VALIDATION', details: err.validation });
  return reply.code(500).send({ error: err.message ?? 'INTERNAL' });
});

await app.listen({ port: env.API_PORT, host: env.API_HOST });
app.log.info(`API ready on http://${env.API_HOST}:${env.API_PORT}`);
