import type { FastifyPluginAsync } from 'fastify';
import { supabaseAdmin } from '../db.js';
import { insertLifecycleEvent } from '../services/lifecycle.js';

const TABLE_BY_KIND: Record<string, string> = {
  ACCOUNT: 'accounts',
  CARD: 'cards',
  FLOW: 'payment_flows',
};

export const historyRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/history', async (req) => {
    const q = req.query as { subject_kind?: string; subject_id?: string; actor?: string; limit?: string };

    let query = supabaseAdmin
      .from('lifecycle_events')
      .select('*')
      .eq('family_id', req.familyId!)
      .order('occurred_at', { ascending: false })
      .limit(Number(q.limit ?? 50));

    if (q.subject_kind) query = query.eq('subject_kind', q.subject_kind);
    if (q.subject_id) query = query.eq('subject_id', q.subject_id);
    if (q.actor) query = query.eq('actor_user_id', q.actor);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return { items: data };
  });

  /**
   * P2: 되돌리기 = 보정 이벤트 append.
   * lifecycle_events는 RLS UPDATE/DELETE 차단됨 → 새 REVERTED 이벤트 append +
   * 대상 엔티티(payment_flows/accounts/cards)는 before_state로 복구.
   *
   * v0.1.1 범위: event_type='UPDATED'만 지원. CREATED/TERMINATED는 v0.2.
   */
  fastify.post('/api/history/:id/revert', async (req, reply) => {
    const { id } = req.params as { id: string };
    const eventId = Number(id);
    if (!Number.isFinite(eventId)) return reply.code(400).send({ error: 'INVALID_ID' });

    const { data: ev } = await supabaseAdmin
      .from('lifecycle_events')
      .select('*')
      .eq('id', eventId)
      .eq('family_id', req.familyId!)
      .maybeSingle();
    if (!ev) return reply.code(404).send({ error: 'NOT_FOUND' });

    // 7일 제한
    const ageMs = Date.now() - new Date(ev.occurred_at).getTime();
    if (ageMs > 7 * 24 * 3600_000) return reply.code(410).send({ error: 'TOO_OLD' });
    if (ev.event_type !== 'UPDATED') return reply.code(400).send({ error: 'ONLY_UPDATE_REVERTABLE' });
    if (!ev.before_state) return reply.code(400).send({ error: 'NO_BEFORE_STATE' });

    const table = TABLE_BY_KIND[ev.subject_kind];
    if (!table) return reply.code(400).send({ error: 'UNKNOWN_SUBJECT_KIND' });

    // 대상의 현재 row 조회 (현재 version 확보)
    const { data: current } = await supabaseAdmin
      .from(table)
      .select('*')
      .eq('id', ev.subject_id)
      .eq('family_id', req.familyId!)
      .maybeSingle();
    if (!current) return reply.code(404).send({ error: 'SUBJECT_NOT_FOUND' });

    // before_state의 필드만 골라 복구 (id/version/created_at은 유지)
    const before = ev.before_state as Record<string, unknown>;
    const restore: Record<string, unknown> = {};
    for (const k of Object.keys(before)) {
      if (['id', 'family_id', 'version', 'created_at', 'updated_at', 'deleted_at'].includes(k)) continue;
      restore[k] = before[k];
    }
    restore.version = current.version + 1;
    restore.updated_at = new Date().toISOString();

    const { data: restored, error: updErr } = await supabaseAdmin
      .from(table)
      .update(restore)
      .eq('id', ev.subject_id)
      .eq('family_id', req.familyId!)
      .select()
      .maybeSingle();
    if (updErr) return reply.code(500).send({ error: updErr.message });

    await insertLifecycleEvent({
      family_id: req.familyId!,
      subject_kind: ev.subject_kind,
      subject_id: ev.subject_id,
      event_type: 'REVERTED',
      reason_code: 'CORRECTION',
      actor_user_id: req.user!.id,
      before_state: current,
      after_state: restored,
      note: `event #${eventId} 되돌림`,
    }, current.owner_user_id);

    return { ok: true, restored };
  });
};
