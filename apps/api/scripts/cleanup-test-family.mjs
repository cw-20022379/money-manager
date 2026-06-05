// 테스트 전 박씨네의 모든 entity wipe (auth users는 보존)
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter(Boolean).filter((l) => !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const FAMILY_ID = '00000000-0000-0000-0000-000000000001';

for (const table of ['lifecycle_events', 'payment_flows', 'cards', 'accounts', 'push_subscriptions', 'notification_rules']) {
  const { error } = await admin.from(table).delete().eq('family_id', FAMILY_ID);
  if (error && !/no rows/i.test(error.message)) {
    console.error(`${table}: ${error.message}`);
  } else {
    console.log(`${table}: cleared`);
  }
}
