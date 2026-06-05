import type { FastifyPluginAsync } from 'fastify';
import { supabaseAdmin } from '../db.js';

export const meRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/me', async (req) => {
    if (!req.user) return { authenticated: false };
    const { data, error } = await supabaseAdmin
      .from('memberships')
      .select('family_id, display_name, role, last_seen_at')
      .eq('user_id', req.user.id)
      .maybeSingle();
    return {
      authenticated: true,
      user_id: req.user.id,
      email: req.user.email,
      membership: data ?? null,
      lookup_error: error?.message,
    };
  });
};
