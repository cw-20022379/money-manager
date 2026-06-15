import {
  MERCHANT_PRESETS,
  matchPresets,
  type Category,
  type MerchantPreset,
} from '@ffn/shared';

/**
 * 정기지출 머천트 자동완성 후보.
 * 두 출처를 합친다:
 *  - `family`: 우리 가족이 이미 등록한 항목(가족 학습). 우선 노출.
 *  - `preset`: 공통 프리셋 카탈로그.
 */
export interface Suggestion {
  source: 'family' | 'preset';
  name: string;
  icon: string;
  category: Category;
  amount: number | null;
  day?: number;
  /** 보조 설명 (예: "이전에 매월 17,000원") */
  hint?: string;
}

/** 가족 학습 입력 — 기존 flows에서 최소 필드만. */
export interface LearnableFlow {
  merchant_name: string;
  category: Category;
  amount_krw: number | null;
  schedule_day: number;
}

/**
 * 입력값을 소문자로 변환하고 공백·구분자를 제거해 비교용 키를 만든다.
 * '쿠팡 와우'와 '쿠팡와우'가 같은 키가 되므로 사용자 입력 불일치를 흡수한다.
 */
function norm(s: string): string {
  return s.toLowerCase().replace(/[\s·+]/g, '');
}

const CATEGORY_ICON: Record<Category, string> = {
  UTILITY: '💡', TELECOM: '📱', INSURANCE: '🛡️', MEDIA: '📺', SAAS: '📝',
  EDUCATION: '📚', LOAN: '🏦', CARD_BILL: '💳', RENT: '🏠', HEALTHCARE: '🏥', OTHER: '💸',
};

function presetToSuggestion(p: MerchantPreset): Suggestion {
  return { source: 'preset', name: p.name, icon: p.icon, category: p.category, amount: p.amount, day: p.day };
}

/**
 * 가족이 이미 등록한 항목에서 자동완성 후보를 만든다.
 * 같은 머천트가 여러 번 등록돼 있어도 첫 번째만 노출 (seen Set으로 중복 제거).
 * hint: "이전에 매월 N원"을 표시해 금액 입력 가이드를 제공.
 */
function familySuggestions(flows: LearnableFlow[], input: string): Suggestion[] {
  const q = norm(input);
  const seen = new Set<string>();
  const out: Suggestion[] = [];
  for (const f of flows) {
    const key = norm(f.merchant_name);
    if (!key || seen.has(key)) continue;
    if (!key.includes(q)) continue;
    seen.add(key);
    out.push({
      source: 'family',
      name: f.merchant_name,
      icon: CATEGORY_ICON[f.category] ?? '💸',
      category: f.category,
      amount: f.amount_krw,
      day: f.schedule_day,
      hint: f.amount_krw != null ? `이전에 매월 ${f.amount_krw.toLocaleString()}원` : '이전에 변동 금액',
    });
  }
  return out;
}

/**
 * 자동완성 후보 목록 생성. 가족 항목 우선, 그 다음 공통 프리셋.
 * 가족이 이미 쓰는 머천트명은 프리셋에서 제거해 중복 표시를 방지한다.
 *
 * 우선순위 설계 이유:
 *   - 가족이 등록한 항목은 실제 쓰는 정보(금액·결제일 포함)라서 더 정확하다.
 *   - 프리셋은 공통 추천이므로 가족 항목이 없을 때 보조 역할.
 */
export function buildSuggestions(input: string, familyFlows: LearnableFlow[], limit = 8): Suggestion[] {
  if (!norm(input)) return [];
  const fam = familySuggestions(familyFlows, input);
  // 가족 항목과 이름이 겹치는 프리셋을 제거한다.
  const famNames = new Set(fam.map((s) => norm(s.name)));
  const pre = matchPresets(input)
    .map(presetToSuggestion)
    .filter((p) => !famNames.has(norm(p.name)));
  return [...fam, ...pre].slice(0, limit);
}

/** 프리셋 카탈로그 크기 (안내 문구용). */
export const PRESET_COUNT = MERCHANT_PRESETS.length;
