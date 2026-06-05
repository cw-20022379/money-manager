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
      if (s === 'subscribed') toast.push('푸시 알림을 켰어요');
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
    <div className="flex items-center justify-between px-4 py-3.5 text-sm">
      <span className="font-medium text-body">🔔 푸시 알림</span>
      <div>
        {status === 'subscribed' && (
          <button disabled={busy} onClick={turnOff}
            className="rounded-full border border-line px-3 py-1 text-xs font-medium text-dim">
            끄기
          </button>
        )}
        {(status === 'default' || status === 'granted') && (
          <button disabled={busy} onClick={turnOn}
            className="rounded-full bg-teal px-3 py-1 text-xs font-bold text-white">
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
    </div>
  );
}
