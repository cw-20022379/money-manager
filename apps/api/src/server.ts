import Fastify, { type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import { env } from './env.js';
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
  origin: ['http://127.0.0.1:5173', 'http://localhost:5173'],
  credentials: true,
});
await app.register(sensible);
await app.register(authPlugin);
await app.register(tenantPlugin);
await app.register(reasonPlugin);
await app.register(optimisticLockPlugin);

await app.register(healthzRoutes);
await app.register(meRoutes);
await app.register(familyRoutes);
await app.register(accountRoutes);
await app.register(cardRoutes);
await app.register(flowRoutes);
await app.register(graphRoutes);
await app.register(historyRoutes);
await app.register(notificationRoutes);

app.setErrorHandler((err: FastifyError, _req, reply) => {
  app.log.error({ err }, 'unhandled');
  if (err.validation) return reply.code(400).send({ error: 'VALIDATION', details: err.validation });
  return reply.code(500).send({ error: err.message ?? 'INTERNAL' });
});

await app.listen({ port: env.API_PORT, host: env.API_HOST });
app.log.info(`API ready on http://${env.API_HOST}:${env.API_PORT}`);
