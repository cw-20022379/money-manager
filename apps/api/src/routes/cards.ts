import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin } from '../db.js';
import { insertLifecycleEvent, type ReasonCode } from '../services/lifecycle.js';

const CreateBody = z.object({
  issuer_name: z.string().min(1).max(60),
  card_type: z.enum(['CREDIT', 'CHECK', 'OTHER']),
  product_name: z.string().min(1).max(60),
  card_number_masked: z.string().max(40).optional(),
  owner_user_id: z.string().uuid().optional().nullable(),
  billing_account_id: z.string().uuid().optional().nullable(),
  billing_cycle_start_day: z.number().int().min(1).max(31).optional(),
  billing_cycle_end_day: z.number().int().min(1).max(31).optional(),
  payment_due_day: z.number().int().min(1).max(31).optional(),
  payment_due_month_offset: z.number().int().min(0).max(3).optional(),
});

const UpdateBody = CreateBody.partial();

function extractLast4(masked?: string): string | null {
  if (!masked) return null;
  const digits = masked.replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : null;
}

export const cardRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/cards', async (req) => {
    const { data, error } = await supabaseAdmin
      .from('cards')
      .select('*')
      .eq('family_id', req.familyId!)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return { items: data };
  });

  fastify.post('/api/cards', async (req, reply) => {
    const body = CreateBody.parse(req.body);
    const { data, error } = await supabaseAdmin
      .from('cards')
      .insert({
        ...body,
        family_id: req.familyId!,
        card_last4: extractLast4(body.card_number_masked),
      })
      .select()
      .single();
    if (error) return reply.code(500).send({ error: error.message });

    await insertLifecycleEvent({
      family_id: req.familyId!,
      subject_kind: 'CARD',
      subject_id: data.id,
      event_type: 'CREATED',
      reason_code: 'LIFE_EVENT',
      actor_user_id: req.user!.id,
      after_state: data,
    }, data.owner_user_id);

    return data;
  });

  fastify.patch('/api/cards/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = UpdateBody.parse(req.body);
    const reason = req.headers['x-reason-code'] as ReasonCode;

    const { data: before } = await supabaseAdmin
      .from('cards')
      .select('*')
      .eq('id', id)
      .eq('family_id', req.familyId!)
      .maybeSingle();
    if (!before) return reply.code(404).send({ error: 'NOT_FOUND' });

    const patch: Record<string, unknown> = { ...body, version: before.version + 1, updated_at: new Date().toISOString() };
    if ('card_number_masked' in body) {
      patch.card_last4 = extractLast4(body.card_number_masked);
    }

    const { data: after, error } = await supabaseAdmin
      .from('cards')
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
      subject_kind: 'CARD',
      subject_id: id,
      event_type: 'UPDATED',
      reason_code: reason,
      actor_user_id: req.user!.id,
      before_state: before,
      after_state: after,
    }, before.owner_user_id);

    return after;
  });

  fastify.delete('/api/cards/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const reason = req.headers['x-reason-code'] as ReasonCode;

    const { data: before } = await supabaseAdmin
      .from('cards')
      .select('*')
      .eq('id', id)
      .eq('family_id', req.familyId!)
      .maybeSingle();
    if (!before) return reply.code(404).send({ error: 'NOT_FOUND' });

    const { data: after, error } = await supabaseAdmin
      .from('cards')
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
      subject_kind: 'CARD',
      subject_id: id,
      event_type: 'TERMINATED',
      reason_code: reason,
      actor_user_id: req.user!.id,
      before_state: before,
    }, before.owner_user_id);

    return { ok: true };
  });
};
