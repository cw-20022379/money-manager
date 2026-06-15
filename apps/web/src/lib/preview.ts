/**
 * Preview 모드 — supabase/백엔드 없이 정적 mock으로 4화면 + 공통 컴포넌트를 그린다.
 * 디자인 컨셉 비교/스크린샷 캡쳐 용도. /preview/* 경로로 진입하면
 * sessionStorage에 플래그가 박혀 이후 라우트 이동에도 mock이 유지된다.
 */

export function isPreviewMode(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.location.pathname.startsWith('/preview')) return true;
  return sessionStorage.getItem('ffn:preview') === '1';
}

export function markPreviewMode(): void {
  if (typeof window !== 'undefined') sessionStorage.setItem('ffn:preview', '1');
}

// ─── mock fixtures ────────────────────────────────────────────────────────────
const FAMILY_ID = 'preview-family';
const USER_ID = 'preview-user';
const HUSBAND = '재현';

const ACC_SALARY = { id: 'acc-1', institution_name: 'KB국민은행', nickname: '월급',
  account_number_masked: '****1234', balance_krw: 5_240_000, version: 1 };
const ACC_EMERG = { id: 'acc-2', institution_name: '카카오뱅크', nickname: '비상금',
  account_number_masked: '****5678', balance_krw: 12_300_000, version: 1 };

const CARD_HYUNDAI = { id: 'card-1', issuer_name: '현대카드', product_name: 'M카드',
  card_number_masked: '****1111', billing_account_id: 'acc-1', payment_due_day: 25, version: 1 };
const CARD_SHINHAN = { id: 'card-2', issuer_name: '신한카드', product_name: '체크카드',
  card_number_masked: '****2222', billing_account_id: 'acc-1', payment_due_day: null, version: 1 };

const FLOWS = [
  { id: 'flow-1', merchant_name: '넷플릭스', category: 'MEDIA', amount_krw: 17_000,
    amount_is_variable: false, schedule_day: 5, source_card_id: 'card-1', source_account_id: null,
    is_draft: false, version: 1 },
  { id: 'flow-2', merchant_name: '아이폰 통신비', category: 'TELECOM', amount_krw: 89_000,
    amount_is_variable: false, schedule_day: 15, source_card_id: null, source_account_id: 'acc-1',
    is_draft: false, version: 1 },
  { id: 'flow-3', merchant_name: '둘째 영어학원', category: 'EDUCATION', amount_krw: 320_000,
    amount_is_variable: false, schedule_day: 25, source_card_id: null, source_account_id: 'acc-1',
    is_draft: false, version: 1 },
  { id: 'flow-4', merchant_name: '실비보험', category: 'INSURANCE', amount_krw: 145_000,
    amount_is_variable: false, schedule_day: 20, source_card_id: null, source_account_id: 'acc-1',
    is_draft: false, version: 1 },
  { id: 'flow-5', merchant_name: '쿠팡 와우', category: 'MEDIA', amount_krw: 7_890,
    amount_is_variable: false, schedule_day: 10, source_card_id: 'card-1', source_account_id: null,
    is_draft: false, version: 1 },
  { id: 'flow-6', merchant_name: '주거 관리비', category: 'RENT', amount_krw: null,
    amount_is_variable: true, schedule_day: 28, source_card_id: null, source_account_id: 'acc-1',
    is_draft: true, version: 1 },
] as const;

const GRAPH = {
  summary: {
    fixed_sum: 578_890,
    active_count: 5,
    draft_count: 1,
    upcoming: [
      { id: 'flow-1', merchant_name: '넷플릭스', amount_krw: 17_000,
        due_date: '2026-06-05', diff_days: 0 },
      { id: 'flow-5', merchant_name: '쿠팡 와우', amount_krw: 7_890,
        due_date: '2026-06-10', diff_days: 2 },
    ],
  },
  tree: [
    {
      id: 'acc-1', nickname: '월급', institution_name: 'KB국민은행', balance_krw: 5_240_000,
      monthly_sum: 571_000,
      cards: [
        {
          id: 'card-1', product_name: 'M카드', issuer_name: '현대카드', monthly_sum: 24_890,
          payment_due_day: 25, payment_due_month_offset: 1,
          children: [
            { id: 'flow-1', merchant_name: '넷플릭스', category: 'MEDIA',
              amount_krw: 17_000, schedule_day: 5, is_draft: false },
            { id: 'flow-5', merchant_name: '쿠팡 와우', category: 'MEDIA',
              amount_krw: 7_890, schedule_day: 10, is_draft: false },
          ],
        },
      ],
      direct_flows: [
        { id: 'flow-2', merchant_name: '아이폰 통신비', category: 'TELECOM',
          amount_krw: 89_000, schedule_day: 15, is_draft: false },
        { id: 'flow-4', merchant_name: '실비보험', category: 'INSURANCE',
          amount_krw: 145_000, schedule_day: 20, is_draft: false },
        { id: 'flow-3', merchant_name: '둘째 영어학원', category: 'EDUCATION',
          amount_krw: 320_000, schedule_day: 25, is_draft: false },
      ],
    },
    {
      id: 'acc-2', nickname: '비상금', institution_name: '카카오뱅크', balance_krw: 12_300_000,
      monthly_sum: 0, cards: [], direct_flows: [],
    },
  ],
  orphan_cards: [
    { id: 'card-2', product_name: '체크카드', issuer_name: '신한카드' },
  ],
};

const ME = {
  authenticated: true,
  user_id: USER_ID,
  email: 'preview@local',
  membership: { family_id: FAMILY_ID, display_name: HUSBAND, role: 'OWNER' as const },
};

const NOTIFICATION_RULE = { has_subscription: false, life_event: true, correction: false };

// ─── router ───────────────────────────────────────────────────────────────────
export async function previewApi<T>(path: string): Promise<T> {
  // 짧은 지연으로 실제 네트워크 흉내 (스크린샷 시 로딩 깜빡임 최소화)
  await new Promise((r) => setTimeout(r, 20));

  if (path === '/api/me') return ME as T;
  if (path === '/api/graph') return GRAPH as T;
  if (path.startsWith('/api/flows')) {
    // /preview에서 DraftResumeBanner 모달이 자동으로 뜨지 않도록 is_draft 쿼리는 빈 배열.
    if (path.includes('is_draft=true')) return { items: [] } as T;
    return { items: FLOWS } as T;
  }
  if (path === '/api/accounts') return { items: [ACC_SALARY, ACC_EMERG] } as T;
  if (path === '/api/cards') return { items: [CARD_HYUNDAI, CARD_SHINHAN] } as T;
  if (path === '/api/history') return { items: [] } as T;
  if (path === '/api/notifications/rules') return NOTIFICATION_RULE as T;
  if (path === '/api/notifications/vapid-key') return { publicKey: '' } as T;
  if (path === '/api/families/members') {
    const now = Date.now();
    return {
      my_role: 'OWNER',
      members: [
        { user_id: USER_ID, display_name: HUSBAND, role: 'OWNER', is_me: true,
          joined_at: '2026-01-02T00:00:00Z', last_seen_at: new Date(now - 2 * 60_000).toISOString() },
        { user_id: 'preview-spouse', display_name: '지민', role: 'MEMBER', is_me: false,
          joined_at: '2026-01-05T00:00:00Z', last_seen_at: new Date(now - 26 * 3_600_000).toISOString() },
      ],
    } as T;
  }
  if (path === '/api/families/invite') return { token: 'preview-INVITE-TOKEN-7d', expires_in_days: 7 } as T;

  // 알 수 없는 경로 — 빈 객체 반환 (모달 등 동작 안 깨지게)
  return {} as T;
}
