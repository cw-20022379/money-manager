/**
 * lib/push.ts — Web Push 알림 유틸
 *
 * Web Push 흐름:
 *   1) enablePush(): 브라우저 권한 요청 → SW 구독(VAPID 공개키) → 서버에 endpoint 등록.
 *   2) 서버는 배우자 변경 시 해당 endpoint로 푸시 전송.
 *   3) Service Worker(sw.ts)가 푸시를 받아 브라우저 알림을 표시.
 *
 * VAPID 공개키는 서버에서 관리한다. 클라이언트는 /api/notifications/push/vapid-key로 가져온다.
 * 로컬 환경에서는 vapid-key가 없을 수 있으므로 Preview 모드에서는 빈 문자열 반환 처리.
 */
import { api } from './api.js';

/**
 * VAPID 공개키는 URL-safe Base64(- _)로 인코딩돼 있다.
 * PushManager.subscribe()는 Uint8Array를 요구하므로 직접 변환한다.
 * 표준 Base64(+ /)로 되돌리고 패딩을 추가해 atob()으로 디코딩.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * 현재 디바이스의 푸시 상태.
 * unsupported: SW/PushManager 미지원 브라우저 (일부 iOS 등)
 * denied: 사용자가 알림 권한 거부. 이 경우 다시 요청할 수 없으며 브라우저 설정에서만 변경 가능.
 * default: 아직 권한 요청 전.
 * granted: 권한 허용됐지만 구독 미등록.
 * subscribed: SW 구독 완료 + 서버에 endpoint 등록됨.
 */
export type PushStatus =
  | 'unsupported'
  | 'denied'
  | 'granted'
  | 'subscribed'
  | 'default';

export async function getPushStatus(): Promise<PushStatus> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission === 'default') return 'default';

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub ? 'subscribed' : 'granted';
}

/**
 * 1) 권한 요청
 * 2) Service Worker push 구독 (VAPID public key)
 * 3) endpoint·keys를 API에 등록
 */
export async function enablePush(): Promise<PushStatus> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';

  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'default';

  const { publicKey } = await api<{ publicKey: string | null }>(
    '/api/notifications/push/vapid-key',
  );
  if (!publicKey) throw new Error('서버에 VAPID 공개키가 설정되어 있지 않습니다 (.env 확인)');

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    });
  }

  const json = sub.toJSON();
  await api('/api/notifications/push/subscribe', {
    method: 'POST',
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
    }),
  });

  return 'subscribed';
}

export async function disablePush(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await api('/api/notifications/push/subscribe', {
    method: 'DELETE',
    body: JSON.stringify({ endpoint: sub.endpoint }),
  });
  await sub.unsubscribe();
}
