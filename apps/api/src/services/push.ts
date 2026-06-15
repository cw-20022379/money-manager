/**
 * services/push.ts — Web Push 발송 서비스
 *
 * 역할: lifecycle 이벤트 발생 시 배우자(actor 제외 가족 구성원)에게 Web Push 알림을 보낸다.
 *
 * VAPID 설계:
 *   Web Push는 VAPID(Voluntary Application Server Identification) 키 쌍이 필요하다.
 *   - 공개키는 클라이언트가 구독 생성 시 브라우저에 전달.
 *   - 비밀키는 서버가 서명 생성 시 사용 → 환경변수로만 보관, 절대 클라이언트 노출 금지.
 *   키가 없으면 initialized=false 상태를 유지하고 발송을 조용히 스킵.
 *   개발 환경에서 VAPID 설정 없이 서버를 띄울 수 있게 하기 위함.
 *
 * Best-effort 발송 전략:
 *   Promise.allSettled 사용 → 일부 구독 발송이 실패해도 나머지는 계속 시도.
 *   발송 실패는 로그만 남기고 caller(lifecycle.ts)에게 오류를 전파하지 않는다.
 *   데이터 저장과 알림은 독립적이어야 한다.
 *
 * 만료된 구독 자동 정리:
 *   410 Gone: 브라우저가 구독을 삭제했음을 push 서버가 알림.
 *   404 Not Found: 구독 endpoint가 더 이상 유효하지 않음.
 *   이 두 상태코드를 받으면 DB의 push_subscriptions 레코드를 즉시 삭제한다.
 *   방치하면 매 이벤트마다 불필요한 HTTP 요청이 쌓이기 때문.
 */
import webpush from 'web-push';
import { env } from '../env.js';
import { supabaseAdmin } from '../db.js';

// 프로세스 수명 동안 VAPID 초기화를 1회만 수행하기 위한 플래그
let initialized = false;

// VAPID 키가 있는지 확인하고 없으면 false 반환.
// 있으면 webpush에 등록하고 initialized=true로 설정.
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
  // VAPID 키 미설정 시 발송 스킵 (개발 환경 대응)
  if (!ensureVapid()) {
    log?.warn?.({ payload }, 'VAPID 키 미설정 — push 발송 스킵');
    return;
  }

  // 가족 멤버 중 actor가 아닌 user_id 목록
  // 자기 자신에게는 알림을 보내지 않는다 (내가 한 행동을 나에게 알릴 필요 없음).
  const { data: members } = await supabaseAdmin
    .from('memberships')
    .select('user_id')
    .eq('family_id', familyId)
    .neq('user_id', actorUserId);
  if (!members || members.length === 0) return;

  const userIds = members.map((m) => m.user_id);
  // 대상 구성원의 등록된 모든 push_subscriptions를 조회.
  // 한 사람이 여러 기기를 쓰는 경우(폰 + 태블릿) 복수 구독이 있을 수 있다.
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
        // 브라우저가 구독을 취소했거나 사용자가 알림 권한을 거부한 경우.
        // 방치하면 매 이벤트마다 헛된 HTTP 요청을 보내게 된다.
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
