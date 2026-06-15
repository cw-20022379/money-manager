/**
 * 시니어 모드 — 전역 확대(zoom) + 가독성 향상.
 * documentElement에 `senior` 클래스를 토글하고 localStorage에 영속화한다.
 * CSS(index.css의 html.senior 규칙)가 실제 스케일/간격을 담당.
 */
const KEY = 'ffn:senior';

export function isSenior(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(KEY) === '1';
}

export function applySenior(on: boolean): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('senior', on);
}

export function setSenior(on: boolean): void {
  localStorage.setItem(KEY, on ? '1' : '0');
  applySenior(on);
}

/** 앱 부팅 시 1회 호출 — 저장된 설정을 즉시 반영. */
export function initSenior(): void {
  applySenior(isSenior());
}
