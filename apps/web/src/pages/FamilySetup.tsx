/**
 * pages/FamilySetup.tsx — 가족 초기 설정
 *
 * 인증은 됐지만 아직 가족(family)이 없는 사용자에게 표시된다.
 * App.tsx의 stage='setup' 단계에서 렌더링된다.
 *
 * 두 가지 경로:
 *   CreateForm: 새 가족 생성 (POST /api/families). 본인이 OWNER가 된다.
 *   JoinForm: 초대 토큰으로 기존 가족 합류 (POST /api/families/join).
 *
 * 완료(onDone) 후 location.reload()로 앱을 재시작한다.
 * 서버에서 membership을 반환하는 타이밍 보장이 어려워 reload가 가장 안전하다.
 * (App.tsx의 FamilySetup onDone 주석 참조)
 */
import { useState } from 'react';
import { api } from '../lib/api.js';

export function FamilySetup({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'new' | 'join' | null>(null);
  return (
    <div className="min-h-screen p-6">
      <h2 className="mb-6 text-xl">가족 시작하기</h2>
      {mode === null && (
        <div className="space-y-3">
          <Card title="🆕 새로운 가족 만들기" onClick={() => setMode('new')}>
            내가 첫 멤버가 됩니다
          </Card>
          <Card title="🤝 초대 링크로 합류하기" onClick={() => setMode('join')}>
            배우자가 보낸 토큰을 입력합니다
          </Card>
        </div>
      )}
      {mode === 'new' && <CreateForm onBack={() => setMode(null)} onDone={onDone} />}
      {mode === 'join' && <JoinForm onBack={() => setMode(null)} onDone={onDone} />}
    </div>
  );
}

function Card({
  title,
  children,
  onClick,
}: { title: string; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="block w-full rounded-xl border border-line bg-panel p-4 text-left hover:border-teal"
    >
      <div className="font-bold text-teal">{title}</div>
      <div className="mt-1 text-sm text-dim">{children}</div>
    </button>
  );
}

function CreateForm({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const [name, setName] = useState('우리 가족');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await api('/api/families', {
        method: 'POST',
        body: JSON.stringify({ name, display_name: displayName }),
      });
      onDone();
    } catch (e: unknown) {
      setErr(JSON.stringify((e as any).detail ?? e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="block text-sm text-dim">가족 이름</label>
        <input
          required value={name} onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-md border border-line bg-panel2 px-3 py-2"
        />
      </div>
      <div>
        <label className="block text-sm text-dim">내 표시 이름</label>
        <input
          required value={displayName} onChange={(e) => setDisplayName(e.target.value)}
          className="mt-1 w-full rounded-md border border-line bg-panel2 px-3 py-2"
        />
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onBack} className="flex-1 rounded-md border border-line py-2">
          ←
        </button>
        <button disabled={busy} className="flex-[3] rounded-md bg-teal py-2 text-bg disabled:opacity-50">
          {busy ? '...' : '만들기'}
        </button>
      </div>
      {err && <p className="text-sm text-warn">{err}</p>}
    </form>
  );
}

function JoinForm({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const [token, setToken] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await api('/api/families/join', {
        method: 'POST',
        body: JSON.stringify({ token, display_name: displayName }),
      });
      onDone();
    } catch (e: unknown) {
      setErr(JSON.stringify((e as any).detail ?? e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="block text-sm text-dim">초대 토큰</label>
        <input
          required value={token} onChange={(e) => setToken(e.target.value)}
          className="mt-1 w-full rounded-md border border-line bg-panel2 px-3 py-2 font-mono"
        />
      </div>
      <div>
        <label className="block text-sm text-dim">내 표시 이름</label>
        <input
          required value={displayName} onChange={(e) => setDisplayName(e.target.value)}
          className="mt-1 w-full rounded-md border border-line bg-panel2 px-3 py-2"
        />
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onBack} className="flex-1 rounded-md border border-line py-2">
          ←
        </button>
        <button disabled={busy} className="flex-[3] rounded-md bg-teal py-2 text-bg disabled:opacity-50">
          {busy ? '...' : '합류하기'}
        </button>
      </div>
      {err && <p className="text-sm text-warn">{err}</p>}
    </form>
  );
}
