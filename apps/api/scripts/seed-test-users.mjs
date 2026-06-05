// 테스트용 부부 2명 시드 + 박씨네 가족 멤버십
// usage: node tests/e2e/seed-users.mjs
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter(Boolean)
    .filter((l) => !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const url = env.SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const FAMILY_ID = '00000000-0000-0000-0000-000000000001';
const USERS = [
  { email: 'husband@test.local', password: 'test1234', display: '남편' },
  { email: 'wife@test.local', password: 'test1234', display: '아내' },
];

async function ensureUser({ email, password }) {
  const { data: existing } = await admin.auth.admin.listUsers();
  const found = existing?.users?.find((u) => u.email === email);
  if (found) return found.id;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  return data.user.id;
}

async function ensureMembership(userId, display) {
  const { error } = await admin
    .from('memberships')
    .upsert({ family_id: FAMILY_ID, user_id: userId, display_name: display }, {
      onConflict: 'user_id',
    });
  if (error) throw error;
}

const results = [];
for (const u of USERS) {
  const id = await ensureUser(u);
  await ensureMembership(id, u.display);
  results.push({ ...u, id });
}

console.log(JSON.stringify(results, null, 2));
