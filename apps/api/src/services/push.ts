import webpush from 'web-push';
import { env } from '../env.js';
import { supabaseAdmin } from '../db.js';

let initialized = false;

function ensureVapid() {
  if (initialized) return true;
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    return false;
  }
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  initialized = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/**
 * 가족의 한 멤버(actor 제외)에게 푸시 발송.
 * Best-effort: 실패해도 throw하지 않고 로그만.
 */
export async function pushToFamilyExceptActor(
  familyId: string,
  actorUserId: string,
  payload: PushPayload,
  log?: { error: (...a: unknown[]) => void; warn: (...a: unknown[]) => void },
) {
  if (!ensureVapid()) {
    log?.warn?.({ payload }, 'VAPID 키 미설정 — push 발송 스킵');
    return;
  }

  // 가족 멤버 중 actor가 아닌 user_id 목록
  const { data: members } = await supabaseAdmin
    .from('memberships')
    .select('user_id')
    .eq('family_id', familyId)
    .neq('user_id', actorUserId);
  if (!members || members.length === 0) return;

  const userIds = members.map((m) => m.user_id);
  const { data: subs } = await supabaseAdmin
    .from('push_subscriptions')
    .select('*')
    .in('user_id', userIds);
  if (!subs || subs.length === 0) return;

  const json = JSON.stringify(payload);
  await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } },
          json,
        );
      } catch (err: unknown) {
        const code = (err as { statusCode?: number }).statusCode;
        // 410 Gone / 404 Not Found: 만료된 구독 → DB에서 제거
        if (code === 410 || code === 404) {
          await supabaseAdmin.from('push_subscriptions').delete().eq('id', s.id);
          log?.warn?.({ id: s.id }, '만료된 push subscription 삭제');
        } else {
          log?.error?.({ err, id: s.id }, 'push 발송 실패');
        }
      }
    }),
  );
}
