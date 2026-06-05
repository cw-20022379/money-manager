import type { FastifyPluginAsync } from 'fastify';
import { supabaseAdmin } from '../db.js';

export const healthzRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/healthz', async () => {
    const { error } = await supabaseAdmin.from('families').select('id').limit(1);
    return {
      ok: !error,
      time: new Date().toISOString(),
      db: error ? `error: ${error.message}` : 'ok',
    };
  });
};
