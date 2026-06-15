/**
 * pages/FamilyMembers.tsx — 가족 구성원 관리
 *
 * 권한 모델:
 *   OWNER: 최초 가족을 만든 사람. 남을 내보낼 수 있으나 본인은 나갈 수 없다.
 *   MEMBER: 초대 토큰으로 합류한 사람. 본인만 나갈 수 있다.
 *   → 소유자는 OWNER_CANNOT_LEAVE 에러를 서버에서 반환.
 *   → 소유자를 내보내려 하면 CANNOT_REMOVE_OWNER 에러.
 *
 * 나가기/내보내기 UX:
 *   confirm 상태에 대상 멤버를 저장 → Modal에서 확인 후 removeMember 호출.
 *   본인이 나가면 location.href='/'로 전체 재시작 (세션 재검사 필요).
 *
 * avatarColor: user_id를 해시해 AVATAR_BG 팔레트에서 색 결정.
 *   같은 사람은 항상 같은 색 → ExpenseSplit 색상과 통일.
 *
 * lastSeenLabel: 마지막 접속 시간을 "N분/시간/일 전" 형식으로 표시.
 */
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Modal } from '../components/Modal.js';
import { useToast } from '../components/Toast.js';

interface Member {
  user_id: string;
  display_name: string;
  role: 'OWNER' | 'MEMBER';
  joined_at: string;
  last_seen_at: string | null;
  is_me: boolean;
}

interface MembersRes {
  my_role: 'OWNER' | 'MEMBER';
  members: Member[];
}

function lastSeenLabel(iso: string | null): string {
  if (!iso) return '접속 기록 없음';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return '방금 접속';
  if (min < 60) return `${min}분 전 접속`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전 접속`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전 접속`;
  return new Date(iso).toLocaleDateString('ko-KR');
}

const AVATAR_BG = ['#00d2c4', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444'];
function avatarColor(seed: string): string {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_BG[h % AVATAR_BG.length]!;
}

export function FamilyMembers() {
  const [data, setData] = useState<MembersRes | null>(null);
  const [invite, setInvite] = useState<{ token: string } | null>(null);
  const [confirm, setConfirm] = useState<Member | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const refresh = useCallback(async () => {
    try {
      setData(await api<MembersRes>('/api/families/members'));
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function createInvite() {
    try {
      const res = await api<{ token: string }>('/api/families/invite', { method: 'POST', body: '{}' });
      setInvite(res);
    } catch {
      toast.push('초대 토큰 생성 실패', 'warn');
    }
  }

  async function removeMember(m: Member) {
    setBusy(true);
    try {
      await api(`/api/families/members/${m.user_id}`, { method: 'DELETE' });
      toast.push(m.is_me ? '가족에서 나왔어요' : `${m.display_name}님을 내보냈어요`);
      setConfirm(null);
      if (m.is_me) { location.href = '/'; return; }
      refresh();
    } catch (e: unknown) {
      const detail = (e as { detail?: { error?: string } }).detail?.error;
      const msg = detail === 'OWNER_CANNOT_LEAVE' ? '소유자는 나갈 수 없어요'
        : detail === 'CANNOT_REMOVE_OWNER' ? '소유자는 내보낼 수 없어요'
          : '처리 실패';
      toast.push(msg, 'warn');
    } finally {
      setBusy(false);
    }
  }

  const iAmOwner = data?.my_role === 'OWNER';

  return (
    <div className="space-y-3 p-4 pb-24" style={{ background: '#f8fafc', minHeight: '100%' }}>
      <header className="pt-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-dim">가족</p>
        <h1 className="text-[20px] font-bold text-body" style={{ letterSpacing: '-0.03em' }}>가족 구성원</h1>
      </header>

      {!data && <div className="py-4 text-[13px] text-dim">불러오는 중...</div>}

      {data && (
        <section className="space-y-2">
          {data.members.map((m) => (
            <div key={m.user_id} className="bs-card flex items-center gap-3 p-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                style={{ background: avatarColor(m.user_id) }}>
                {m.display_name.slice(0, 1)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-semibold text-body">{m.display_name}</span>
                  {m.is_me && <span className="shrink-0 rounded bg-panel2 px-1.5 text-[10px] text-dim">나</span>}
                  <span className={`shrink-0 rounded px-1.5 text-[10px] ${
                    m.role === 'OWNER' ? 'bg-teal/15 text-teal' : 'bg-panel2 text-dim'
                  }`}>{m.role === 'OWNER' ? '소유자' : '구성원'}</span>
                </div>
                <div className="mt-0.5 text-xs text-dim">{lastSeenLabel(m.last_seen_at)}</div>
              </div>
                      {/* 액션 버튼 표시 조건:
                  - 본인이고 OWNER가 아닌 경우 → 나가기 (OWNER는 나갈 수 없음)
                  - 내가 OWNER이고 상대가 MEMBER인 경우 → 내보내기 */}
              {((m.is_me && m.role !== 'OWNER') || (!m.is_me && iAmOwner && m.role !== 'OWNER')) && (
                <button onClick={() => setConfirm(m)}
                  className="shrink-0 rounded-md border border-line px-2.5 py-1 text-xs text-dim hover:border-bad hover:text-bad">
                  {m.is_me ? '나가기' : '내보내기'}
                </button>
              )}
            </div>
          ))}
        </section>
      )}

      {/* 초대 */}
      <section className="bs-card p-4">
        <h2 className="mb-2 text-xs text-dim">🤝 배우자·가족 초대</h2>
        {invite ? (
          <div className="space-y-2">
            <div className="break-all rounded bg-panel2 p-2 font-mono text-xs text-body">{invite.token}</div>
            <div className="text-xs text-dim">이 토큰을 가족에게 전달하세요 (7일 유효).</div>
          </div>
        ) : (
          <button onClick={createInvite}
            className="rounded-md px-3 py-1.5 text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, #00d2c4, #0bbcb0)' }}>
            초대 토큰 만들기
          </button>
        )}
      </section>

      {confirm && (
        <Modal title={confirm.is_me ? '가족에서 나가기' : '구성원 내보내기'} onClose={() => setConfirm(null)}>
          <p className="text-sm text-body">
            {confirm.is_me
              ? '정말 이 가족에서 나가시겠어요? 다시 들어오려면 초대 토큰이 필요해요.'
              : <><b className="text-bad">{confirm.display_name}</b>님을 가족에서 내보낼까요?</>}
          </p>
          <p className="mt-1 text-xs text-dim">등록된 계좌·카드·정기지출 데이터는 가족에 그대로 남아요.</p>
          <div className="mt-4 flex gap-2">
            <button onClick={() => setConfirm(null)}
              className="flex-1 rounded-md border border-line py-2.5 text-sm text-dim">취소</button>
            <button disabled={busy} onClick={() => removeMember(confirm)}
              className="flex-1 rounded-md bg-bad py-2.5 text-sm font-semibold text-white disabled:opacity-50">
              {busy ? '처리 중...' : confirm.is_me ? '나가기' : '내보내기'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
