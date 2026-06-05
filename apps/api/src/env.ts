import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  API_PORT: z.coerce.number().default(3000),
  API_HOST: z.string().default('127.0.0.1'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:dev@local'),
});

export const env = schema.parse(process.env);
