import { api } from './api.js';

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

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
