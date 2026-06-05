import { useState } from 'react';
import { supabase } from '../lib/supabase.js';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      const fn = mode === 'in' ? supabase.auth.signInWithPassword : supabase.auth.signUp;
      const { error } = await fn.call(supabase.auth, { email, password });
      if (error) setMsg(error.message);
      else if (mode === 'up')
        setMsg('가입 메일이 전송됐어요. Inbucket(http://127.0.0.1:54324)에서 확인 후 로그인하세요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-line bg-panel p-6"
      >
        <h1 className="text-2xl">
          💚 <span className="text-teal">우리 가족 금융 내비</span>
        </h1>
        <p className="text-sm text-dim">
          {mode === 'in' ? '로그인' : '이메일로 가입'}
        </p>

        <input
          type="email"
          required
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-line bg-panel2 px-3 py-2"
        />
        <input
          type="password"
          required
          minLength={6}
          placeholder="비밀번호 (6자 이상)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-line bg-panel2 px-3 py-2"
        />

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-teal py-2 text-bg disabled:opacity-50"
        >
          {busy ? '...' : mode === 'in' ? '로그인' : '가입하기'}
        </button>

        <button
          type="button"
          onClick={() => setMode(mode === 'in' ? 'up' : 'in')}
          className="block w-full text-sm text-dim underline"
        >
          {mode === 'in' ? '계정 만들기' : '이미 계정이 있어요'}
        </button>

        {msg && <p className="text-sm text-warn">{msg}</p>}
      </form>
    </div>
  );
}
