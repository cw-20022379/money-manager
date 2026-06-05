import { supabase } from './supabase.js';
import { isPreviewMode, previewApi } from './preview.js';

const API_URL = (import.meta.env.VITE_API_URL as string) || 'http://127.0.0.1:3000';

type Options = RequestInit & { reasonCode?: 'LIFE_EVENT' | 'CORRECTION'; version?: number };

export async function api<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  if (isPreviewMode()) return previewApi<T>(path);

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const headers = new Headers(opts.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (opts.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  if (opts.reasonCode) headers.set('x-reason-code', opts.reasonCode);
  if (opts.version != null) headers.set('if-match', String(opts.version));

  const res = await fetch(API_URL + path, { ...opts, headers });
  if (!res.ok) {
    let detail: unknown;
    try { detail = await res.json(); } catch { detail = await res.text(); }
    throw Object.assign(new Error(`API ${res.status}`), { status: res.status, detail });
  }
  return res.status === 204 ? (undefined as T) : await res.json();
}
