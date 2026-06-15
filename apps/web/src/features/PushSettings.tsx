/**
 * features/PushSettings.tsx — 푸시 알림 설정 UI
 *
 * 현재 구독 상태(PushStatus)에 따라 다른 UI를 표시한다.
 *   subscribed: "끄기" 버튼만 표시.
 *   default/granted: "켜기" 버튼 표시 → enablePush() 호출.
 *   denied: 안내 텍스트만 표시 (브라우저 설정에서만 변경 가능).
 *   unsupported: 안내 텍스트만 표시.
 *
 * More.tsx의 "알림" 섹션 안에 렌더링된다.
 * lib/push.ts의 enablePush / disablePush / getPushStatus 를 직접 호출한다.
 */
import { useEffect, useState } from 'react';
import { disablePush, enablePush, getPushStatus, type PushStatus } from '../lib/push.js';
import { useToast } from '../components/Toast.js';

export function PushSettings() {
  const [status, setStatus] = useState<PushStatus>('default');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    getPushStatus().then(setStatus);
  }, []);

  async function turnOn() {
    setBusy(true);
    try {
      const s = await enablePush();
      setStatus(s);
      if (s === 'subscribed') toast.push('🔔 푸시 알림을 켰어요');
      else if (s === 'denied') toast.push('브라우저 알림 권한이 거부됨', 'warn');
      else if (s === 'unsupported') toast.push('이 브라우저는 푸시 미지원', 'warn');
    } catch (e: unknown) {
      toast.push(String(e instanceof Error ? e.message : e), 'warn');
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      await disablePush();
      setStatus('granted');
      toast.push('푸시 알림을 껐어요');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-line bg-panel px-3 py-2 text-sm">
      <div className="flex items-center justify-between">
        <span>🔔 푸시 알림</span>
        {status === 'subscribed' && (
          <button disabled={busy} onClick={turnOff}
            className="rounded border border-line px-2 py-0.5 text-xs text-dim">
            끄기
          </button>
        )}
        {(status === 'default' || status === 'granted') && (
          <button disabled={busy} onClick={turnOn}
            className="rounded bg-teal px-2 py-0.5 text-xs font-semibold text-bg">
            켜기
          </button>
        )}
        {status === 'denied' && (
          <span className="text-xs text-warn">권한 거부됨 (브라우저 설정)</span>
        )}
        {status === 'unsupported' && (
          <span className="text-xs text-dim">브라우저 미지원</span>
        )}
      </div>
      {status === 'subscribed' && (
        <div className="mt-1 text-xs text-dim">앱을 닫아도 배우자 변경 시 푸시가 옵니다.</div>
      )}
    </div>
  );
}
