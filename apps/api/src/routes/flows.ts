import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin } from '../db.js';
import { insertLifecycleEvent, type ReasonCode } from '../services/lifecycle.js';

const CreateBody = z
  .object({
    flow_kind: z.enum(['CARD_RECURRING', 'BANK_AUTO_TRANSFER', 'CARD_BILL_PAYMENT', 'OTHER']),
    merchant_name: z.string().min(1).max(60),
    category: z.enum([
      'UTILITY','TELECOM','INSURANCE','MEDIA','SAAS','EDUCATION',
      'LOAN','CARD_BILL','RENT','HEALTHCARE','OTHER',
    ]),
    source_account_id: z.string().uuid().nullable().optional(),
    source_card_id: z.string().uuid().nullable().optional(),
    amount_krw: z.number().int().positive().nullable().optional(),
    amount_is_variable: z.boolean().default(false),
    schedule_freq: z.string().default('MONTHLY'),
    schedule_day: z.number().int().min(1).max(31),
    owner_user_id: z.string().uuid().nullable().optional(),
    notes: z.string().max(200).optional(),
    is_draft: z.boolean().default(false),
  })
  .refine(
    (v) => !!v.source_account_id !== !!v.source_card_id,
    { message: 'source_account_id와 source_card_id 중 정확히 하나만 지정해야 합니다 (XOR)' },
  );

const UpdateBody = CreateBody.innerType().partial();

export const flowRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/flows', async (req) => {
    const q = req.query as { status?: string; is_draft?: string; card_id?: string; account_id?: string; limit?: string };

    let query = supabaseAdmin
      .from('payment_flows')
      .select('*')
      .eq('family_id', req.familyId!)
      .is('deleted_at', null)
      .order('schedule_day', { ascending: true });

    if (q.status) query = query.eq('status', q.status);
    if (q.is_draft != null) query = query.eq('is_draft', q.is_draft === 'true');
    if (q.card_id) query = query.eq('source_card_id', q.card_id);
    if (q.account_id) query = query.eq('source_account_id', q.account_id);
    if (q.limit) query = query.limit(Number(q.limit));

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return { items: data };
  });

  // P3: DB unique 제거 + 서비스 레이어 휴리스틱 가드
  fastify.get('/api/flows/similar', async (req) => {
    const q = req.query as { merchant?: string; schedule_day?: string; source_card_id?: string; source_account_id?: string };
    if (!q.merchant || !q.schedule_day) return { items: [] };

    let query = supabaseAdmin
      .from('payment_flows')
      .select('*')
      .eq('family_id', req.familyId!)
      .eq('status', 'ACTIVE')
      .is('deleted_at', null)
      .ilike('merchant_name', q.merchant)
      .eq('schedule_day', Number(q.schedule_day));
    if (q.source_card_id) query = query.eq('source_card_id', q.source_card_id);
    if (q.source_account_id) query = query.eq('source_account_id', q.source_account_id);

    const { data } = await query;
    return { items: data ?? [] };
  });

  fastify.post('/api/flows', async (req, reply) => {
    const body = CreateBody.parse(req.body);
    const { data, error } = await supabaseAdmin
      .from('payment_flows')
      .insert({ ...body, family_id: req.familyId! })
      .select()
      .single();
    if (error) return reply.code(500).send({ error: error.message });

    await insertLifecycleEvent({
      family_id: req.familyId!,
      subject_kind: 'FLOW',
      subject_id: data.id,
      event_type: 'CREATED',
      reason_code: 'LIFE_EVENT',
      actor_user_id: req.user!.id,
      after_state: data,
    }, data.owner_user_id);

    return data;
  });

  fastify.patch('/api/flows/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = UpdateBody.parse(req.body);
    const reason = req.headers['x-reason-code'] as ReasonCode;

    const { data: before } = await supabaseAdmin
      .from('payment_flows')
      .select('*')
      .eq('id', id)
      .eq('family_id', req.familyId!)
      .maybeSingle();
    if (!before) return reply.code(404).send({ error: 'NOT_FOUND' });

    const { data: after, error } = await supabaseAdmin
      .from('payment_flows')
      .update({ ...body, version: before.version + 1, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('family_id', req.familyId!)
      .eq('version', req.expectedVersion!)
      .is('deleted_at', null)
      .select()
      .maybeSingle();
    if (error) return reply.code(500).send({ error: error.message });
    if (!after) return reply.code(409).send({ error: 'VERSION_CONFLICT' });

    await insertLifecycleEvent({
      family_id: req.familyId!,
      subject_kind: 'FLOW',
      subject_id: id,
      event_type: 'UPDATED',
      reason_code: reason,
      actor_user_id: req.user!.id,
      before_state: before,
      after_state: after,
    }, before.owner_user_id);

    return after;
  });

  fastify.delete('/api/flows/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const reason = req.headers['x-reason-code'] as ReasonCode;

    const { data: before } = await supabaseAdmin
      .from('payment_flows')
      .select('*')
      .eq('id', id)
      .eq('family_id', req.familyId!)
      .maybeSingle();
    if (!before) return reply.code(404).send({ error: 'NOT_FOUND' });

    const { data: after, error } = await supabaseAdmin
      .from('payment_flows')
      .update({
        status: 'TERMINATED',
        terminated_on: new Date().toISOString().slice(0, 10),
        deleted_at: new Date().toISOString(),
        version: before.version + 1,
      })
      .eq('id', id)
      .eq('family_id', req.familyId!)
      .eq('version', req.expectedVersion!)
      .select()
      .maybeSingle();
    if (error) return reply.code(500).send({ error: error.message });
    if (!after) return reply.code(409).send({ error: 'VERSION_CONFLICT' });

    await insertLifecycleEvent({
      family_id: req.familyId!,
      subject_kind: 'FLOW',
      subject_id: id,
      event_type: 'TERMINATED',
      reason_code: reason,
      actor_user_id: req.user!.id,
      before_state: before,
    }, before.owner_user_id);

    return { ok: true };
  });
};
