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
        { onConflict: 'endpoint' },
      );
    if (error) return reply.code(500).send({ error: error.message });
    return { ok: true };
  });

  // 구독 해제
  fastify.delete('/api/notifications/push/subscribe', async (req, reply) => {
    const body = z.object({ endpoint: z.string().url() }).parse(req.body);
    await supabaseAdmin.from('push_subscriptions').delete()
      .eq('user_id', req.user!.id).eq('endpoint', body.endpoint);
    return reply.code(204).send();
  });

  // 알림 규칙 (이미 P1에서 만든 테이블)
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
      .upsert({ user_id: req.user.id, ...body }, { onConflict: 'user_id' })
      .select()
      .maybeSingle();
    if (error) return reply.code(500).send({ error: error.message });
    return data;
  });
};
