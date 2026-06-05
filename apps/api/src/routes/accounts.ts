import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin } from '../db.js';
import { insertLifecycleEvent, type ReasonCode } from '../services/lifecycle.js';

const CreateBody = z.object({
  institution_name: z.string().min(1).max(60),
  account_type: z.enum(['CHECKING', 'SAVINGS', 'LOAN', 'OTHER']),
  nickname: z.string().min(1).max(60),
  account_number_masked: z.string().max(40).optional(),
  balance_krw: z.number().int().nonnegative().optional(),
  owner_user_id: z.string().uuid().optional().nullable(),
});

const UpdateBody = CreateBody.partial();

// P10: 마스킹 문자열에서 last4 자동 추출
function extractLast4(masked?: string): string | null {
  if (!masked) return null;
  const digits = masked.replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : null;
}

export const accountRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/accounts', async (req) => {
    const { data, error } = await supabaseAdmin
      .from('accounts')
      .select('*')
      .eq('family_id', req.familyId!)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return { items: data };
  });

  fastify.post('/api/accounts', async (req, reply) => {
    const body = CreateBody.parse(req.body);
    const last4 = extractLast4(body.account_number_masked);
    const { data, error } = await supabaseAdmin
      .from('accounts')
      .insert({
        ...body,
        family_id: req.familyId!,
        account_last4: last4,
      })
      .select()
      .single();
    if (error) return reply.code(500).send({ error: error.message });

    await insertLifecycleEvent({
      family_id: req.familyId!,
      subject_kind: 'ACCOUNT',
      subject_id: data.id,
      event_type: 'CREATED',
      reason_code: 'LIFE_EVENT',
      actor_user_id: req.user!.id,
      after_state: data,
    }, data.owner_user_id);

    return data;
  });

  fastify.patch('/api/accounts/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = UpdateBody.parse(req.body);
    const reason = req.headers['x-reason-code'] as ReasonCode;

    const { data: before } = await supabaseAdmin
      .from('accounts')
      .select('*')
      .eq('id', id)
      .eq('family_id', req.familyId!)
      .maybeSingle();
    if (!before) return reply.code(404).send({ error: 'NOT_FOUND' });

    const patch: Record<string, unknown> = { ...body, version: before.version + 1, updated_at: new Date().toISOString() };
    if ('account_number_masked' in body) {
      patch.account_last4 = extractLast4(body.account_number_masked);
    }

    const { data: after, error } = await supabaseAdmin
      .from('accounts')
      .update(patch)
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
      subject_kind: 'ACCOUNT',
      subject_id: id,
      event_type: 'UPDATED',
      reason_code: reason,
      actor_user_id: req.user!.id,
      before_state: before,
      after_state: after,
    }, before.owner_user_id);

    return after;
  });

  fastify.delete('/api/accounts/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const reason = req.headers['x-reason-code'] as ReasonCode;

    const { data: before } = await supabaseAdmin
      .from('accounts')
      .select('*')
      .eq('id', id)
      .eq('family_id', req.familyId!)
      .maybeSingle();
    if (!before) return reply.code(404).send({ error: 'NOT_FOUND' });

    const { data: after, error } = await supabaseAdmin
      .from('accounts')
      .update({ deleted_at: new Date().toISOString(), version: before.version + 1 })
      .eq('id', id)
      .eq('family_id', req.familyId!)
      .eq('version', req.expectedVersion!)
      .select()
      .maybeSingle();
    if (error) return reply.code(500).send({ error: error.message });
    if (!after) return reply.code(409).send({ error: 'VERSION_CONFLICT' });

    await insertLifecycleEvent({
      family_id: req.familyId!,
      subject_kind: 'ACCOUNT',
      subject_id: id,
      event_type: 'TERMINATED',
      reason_code: reason,
      actor_user_id: req.user!.id,
      before_state: before,
    }, before.owner_user_id);

    return { ok: true };
  });
};
