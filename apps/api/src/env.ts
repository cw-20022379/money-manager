import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  // Render 등 PaaS는 PORT를 자동 주입한다. PORT 우선, 없으면 API_PORT, 그것도 없으면 3000.
  API_PORT: z.coerce.number().default(Number(process.env.PORT ?? 3000)),
  API_HOST: z.string().default('127.0.0.1'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:dev@local'),
  // 쉼표로 구분한 추가 허용 오리진 (배포 도메인). 로컬 오리진은 항상 허용.
  CORS_ORIGINS: z.string().optional(),
});

export const env = schema.parse(process.env);

/** CORS 허용 오리진 목록 — 로컬 기본 + CORS_ORIGINS env(쉼표 구분). */
export const corsOrigins: string[] = [
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  ...(env.CORS_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean) ?? []),
];
