/**
 * lib/api.ts — 듀얼 모드 HTTP 클라이언트
 *
 * isPreviewMode()이면 previewApi(mock)를, 아니면 실제 백엔드를 호출한다.
 * 이 한 곳에서 분기하므로 각 페이지는 모드를 신경 쓰지 않아도 된다.
 *
 * 특수 헤더:
 *   x-reason-code: 변경 사유(LIFE_EVENT | CORRECTION). 백엔드가 이 값을 보고
 *     lifecycle_events 레코드를 생성하고 notify_spouse 여부를 결정한다.
 *   if-match: 낙관적 잠금(Optimistic Locking). 클라이언트가 읽은 버전 번호를 전송하면
 *     서버가 현재 버전과 비교해 충돌 시 409를 반환한다.
 */
import { supabase } from './supabase.js';
import { isPreviewMode, previewApi } from './preview.js';

const API_URL = (import.meta.env.VITE_API_URL as string) || 'http://127.0.0.1:3000';

type Options = RequestInit & { reasonCode?: 'LIFE_EVENT' | 'CORRECTION'; version?: number };

export async function api<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  // Preview 모드: 실제 네트워크 없이 mock 데이터 반환.
  if (isPreviewMode()) return previewApi<T>(path);

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const headers = new Headers(opts.headers);
  // JWT를 Bearer로 붙여 서버가 RLS(Row Level Security)를 적용할 수 있게 한다.
  if (token) headers.set('Authorization', `Bearer ${token}`);
  // body가 있으면 Content-Type을 자동 설정 (FormData 등이 오면 덮어쓰지 않는다).
  if (opts.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  // reason-code: PATCH/DELETE 시 필수. 누락 시 서버 400.
  if (opts.reasonCode) headers.set('x-reason-code', opts.reasonCode);
  // if-match: 낙관적 잠금. 클라이언트가 읽은 버전을 보내 동시 편집 충돌을 감지.
  if (opts.version != null) headers.set('if-match', String(opts.version));

  const res = await fetch(API_URL + path, { ...opts, headers });
  if (!res.ok) {
    // 에러 바디를 가능하면 JSON으로, 실패하면 텍스트로 담아 던진다.
    // 호출부에서 (e as { detail?: { error?: string } }).detail?.error 로 꺼낼 수 있다.
    let detail: unknown;
    try { detail = await res.json(); } catch { detail = await res.text(); }
    throw Object.assign(new Error(`API ${res.status}`), { status: res.status, detail });
  }
  // 204 No Content: DELETE 응답. body가 없으므로 undefined를 반환한다.
  return res.status === 204 ? (undefined as T) : await res.json();
}
