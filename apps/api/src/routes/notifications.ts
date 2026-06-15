/**
 * routes/notifications.ts — Web Push 구독 관리 + 알림 규칙 설정 라우트
 *
 * ★ Web Push 구독 흐름:
 *   1. 클라이언트가 GET /api/notifications/push/vapid-key 로 공개키를 받는다.
 *   2. Service Worker가 브라우저 PushManager.subscribe(vapidPublicKey)를 호출,
 *      endpoint + p256dh + auth 키를 생성한다.
 *   3. 클라이언트가 POST /api/notifications/push/subscribe 로 이 세 값을 서버에 저장.
 *   4. 이후 lifecycle 이벤트 발생 시 push.ts가 저장된 endpoint로 알림을 발송한다.
 *
 * upsert onConflict('endpoint'):
 *   같은 endpoint로 재구독 요청이 오면 기존 레코드를 갱신한다.
 *   브라우저 재설치나 토큰 갱신으로 p256dh·auth_key가 바뀌어도 endpoint는 동일.
 *   이 경우 새 키로 업데이트해야 알림이 정상 발송된다.
 *
 * 알림 규칙(notification_rules):
 *   - threshold_krw: 이 금액 이상의 변경만 알림 (소액 변경 노이즈 방지).
 *   - quiet_start_hour / quiet_end_hour: 야간 방해 금지 시간대.
 *   - categories_off: 알림을 끈 카테고리 목록 (예: 보험료 변경은 알림 불필요).
 *   - digest_mode: 즉시 알림 대신 묶어서 하루 한 번 요약 발송 (미구현, v0.2).
 *   규칙이 없으면 기본값을 반환해 UI가 항상 설정을 표시할 수 있도록 한다.
 *
 * PUT /api/notifications/rules:
 *   upsert(onConflict: 'user_id') — 첫 설정이면 INSERT, 이미 있으면 UPDATE.
 *   reason 플러그인 면제 대상: 개인 설정 변경이므로 X-Reason-Code 불필요.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin } from '../db.js';
import { env } from '../env.js';

const SubscribeBody = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
});

export const notificationRoutes: FastifyPluginAsync = async (fastify) => {
  // VAPID 공개키 조회 (클라이언트가 구독 생성 시 필요)
  // 공개키는 노출해도 안전 — 비밀키(VAPID_PRIVATE_KEY)는 서버에서만 보관
  fastify.get('/api/notifications/push/vapid-key', async () => {
    return { publicKey: env.VAPID_PUBLIC_KEY ?? null };
  });

  // 구독 등록 (Service Worker가 받은 endpoint·키 저장)
  fastify.post('/api/notifications/push/subscribe', async (req, reply) => {
    const body = SubscribeBody.parse(req.body);
    if (!req.user) return reply.code(401).send();

    const { error } = await supabaseAdmin
      .from('push_subscriptions')
      .upsert(
        {
          user_id: req.user.id,
          endpoint: body.endpoint,
          p256dh: body.keys.p256dh,
          auth_key: body.keys.auth,
        },
        // endpoint는 브라우저마다 고유 — 재구독 시 키만 갱신
        { onConflict: 'endpoint' },
      );
    if (error) return reply.code(500).send({ error: error.message });
    return { ok: true };
  });

  // 구독 해제
  // reason 플러그인 면제 대상: 멱등 관리 작업, 사유 불필요
  fastify.delete('/api/notifications/push/subscribe', async (req, reply) => {
    const body = z.object({ endpoint: z.string().url() }).parse(req.body);
    await supabaseAdmin.from('push_subscriptions').delete()
      .eq('user_id', req.user!.id).eq('endpoint', body.endpoint);
    return reply.code(204).send();
  });

  // 알림 규칙 (이미 P1에서 만든 테이블)
  // 규칙이 없으면 기본값 반환 — 프론트엔드가 null 처리를 하지 않아도 됨
  fastify.get('/api/notifications/rules', async (req) => {
    if (!req.user) throw new Error('no user');
    const { data } = await supabaseAdmin
      .from('notification_rules')
      .select('*')
      .eq('user_id', req.user.id)
      .maybeSingle();
    return data ?? {
      user_id: req.user.id,
      threshold_krw: 50_000,
      quiet_start_hour: 22,
      quiet_end_hour: 8,
      categories_off: [],
      digest_mode: true,
    };
  });

  // 알림 규칙 저장 (PUT = 전체 교체, upsert로 초기 생성도 처리)
  fastify.put('/api/notifications/rules', async (req, reply) => {
    if (!req.user) return reply.code(401).send();
    const Body = z.object({
      threshold_krw: z.number().int().min(0).optional(),
      quiet_start_hour: z.number().int().min(0).max(23).optional(),
      quiet_end_hour: z.number().int().min(0).max(23).optional(),
      categories_off: z.array(z.string()).optional(),
      digest_mode: z.boolean().optional(),
    });
    const body = Body.parse(req.body);
    const { data, error } = await supabaseAdmin
      .from('notification_rules')
      // user_id 충돌 시 UPDATE — 1인 1규칙 테이블
      .upsert({ user_id: req.user.id, ...body }, { onConflict: 'user_id' })
      .select()
      .maybeSingle();
    if (error) return reply.code(500).send({ error: error.message });
    return data;
  });
};
