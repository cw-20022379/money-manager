/**
 * env.ts — 환경변수 스키마 정의 및 검증
 *
 * 시작 시점에 Zod로 파싱하여, 필수 환경변수가 없으면 즉시 프로세스를 종료한다.
 * 런타임에 undefined를 만나는 것보다 명시적 실패가 디버깅에 훨씬 유리하다.
 *
 * 설계 결정:
 *  - API_PORT: Render·Railway 등 PaaS는 PORT 환경변수를 자동 주입한다.
 *    내부 변수명(API_PORT)과 다르므로 `process.env.PORT ?? 3000`으로 먼저 읽은 뒤
 *    z.coerce.number()로 문자열→숫자 변환. API_PORT가 따로 있으면 그쪽이 우선.
 *  - VAPID_*: Web Push에 필요한 VAPID 키. 옵셔널로 선언하여 키 없이도 서버가 뜬다.
 *    push.ts에서 VAPID 키 부재 시 발송을 스킵하므로 개발 환경에서 설정 불필요.
 *  - CORS_ORIGINS: 배포 도메인을 쉼표로 구분해 추가 허용. 로컬 5173은 코드에 하드코딩.
 *    이렇게 하면 환경변수 하나로 프리뷰 URL·프로덕션 URL을 모두 커버할 수 있다.
 */
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
