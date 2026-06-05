import type { FastifyPluginAsync } from 'fastify';
import { supabaseAdmin } from '../db.js';

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
};
