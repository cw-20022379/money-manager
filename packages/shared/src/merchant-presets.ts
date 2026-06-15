import type { Category } from './types.js';

/**
 * 한국 가정에서 흔한 정기지출 프리셋 카탈로그.
 * 머천트 이름을 고르면 카테고리·금액·결제일 기본값을 한 번에 채워준다.
 *
 * - `aliases`: 검색 매칭용 별칭(영문/약칭/오타 방지). 표시는 항상 `name`.
 * - `amount`: 대표 요금(원). 플랜이 여러 개면 가장 흔한 값. null이면 변동.
 *             null인 경우 amount_is_variable=true로 자동 설정되어 변동 지출로 등록된다.
 * - `day`: 흔한 결제일(없으면 생략, 사용자 입력 유도).
 */
export interface MerchantPreset {
  name: string;
  icon: string;
  category: Category;
  aliases: string[];
  /**
   * 대표 월정액(원). null = 변동 지출 (공과금·보험·대출 등 금액이 매달 달라지는 항목).
   * null이면 FlowForm에서 amount_is_variable 체크박스가 자동으로 활성화된다.
   */
  amount: number | null;
  day?: number;
}

export const MERCHANT_PRESETS: MerchantPreset[] = [
  // ── OTT / 미디어 ──────────────────────────────────────────────
  { name: '넷플릭스', icon: '📺', category: 'MEDIA', amount: 13_500, aliases: ['netflix', '넷플'] },
  { name: '디즈니+', icon: '📺', category: 'MEDIA', amount: 9_900, aliases: ['disney', '디즈니플러스'] },
  { name: '티빙', icon: '📺', category: 'MEDIA', amount: 17_000, aliases: ['tving'] },
  { name: '쿠팡플레이', icon: '📺', category: 'MEDIA', amount: 7_890, aliases: ['coupang play'] },
  { name: '웨이브', icon: '📺', category: 'MEDIA', amount: 13_900, aliases: ['wavve'] },
  { name: '왓챠', icon: '📺', category: 'MEDIA', amount: 12_900, aliases: ['watcha'] },
  { name: '유튜브 프리미엄', icon: '▶️', category: 'MEDIA', amount: 14_900, aliases: ['youtube', '유튜브'] },
  { name: '스포티파이', icon: '🎵', category: 'MEDIA', amount: 10_900, aliases: ['spotify'] },
  { name: '애플뮤직', icon: '🎵', category: 'MEDIA', amount: 8_900, aliases: ['apple music'] },
  { name: '멜론', icon: '🎵', category: 'MEDIA', amount: 10_900, aliases: ['melon'] },
  { name: '지니뮤직', icon: '🎵', category: 'MEDIA', amount: 8_400, aliases: ['genie'] },

  // ── 구독앱 / SaaS ─────────────────────────────────────────────
  { name: 'ChatGPT Plus', icon: '🤖', category: 'SAAS', amount: 29_000, aliases: ['chatgpt', 'openai', '챗지피티'] },
  { name: 'Claude Pro', icon: '🤖', category: 'SAAS', amount: 29_000, aliases: ['claude', '클로드'] },
  { name: '노션', icon: '📝', category: 'SAAS', amount: 14_000, aliases: ['notion'] },
  { name: 'Microsoft 365', icon: '🖥️', category: 'SAAS', amount: 11_900, aliases: ['office', 'ms365', '오피스'] },
  { name: '어도비 CC', icon: '🎨', category: 'SAAS', amount: 24_000, aliases: ['adobe', '포토샵'] },
  { name: '구글 One', icon: '☁️', category: 'SAAS', amount: 2_400, aliases: ['google one', '구글원'] },
  { name: 'iCloud+', icon: '☁️', category: 'SAAS', amount: 1_100, aliases: ['icloud', '아이클라우드'] },
  { name: '쿠팡 와우', icon: '🛒', category: 'SAAS', amount: 7_890, aliases: ['coupang', '와우멤버십'] },
  { name: '네이버플러스 멤버십', icon: '🛒', category: 'SAAS', amount: 4_900, aliases: ['naver plus', '네이버멤버십'] },
  { name: '배민클럽', icon: '🍽️', category: 'SAAS', amount: 3_990, aliases: ['배달의민족', 'baemin'] },

  // ── 통신 ──────────────────────────────────────────────────────
  { name: 'SKT 통신비', icon: '📱', category: 'TELECOM', amount: 55_000, aliases: ['sk텔레콤', 'skt'] },
  { name: 'KT 통신비', icon: '📱', category: 'TELECOM', amount: 55_000, aliases: ['kt', '케이티'] },
  { name: 'LG U+ 통신비', icon: '📱', category: 'TELECOM', amount: 55_000, aliases: ['lgu+', '유플러스', 'lg유플러스'] },
  { name: '알뜰폰 요금', icon: '📱', category: 'TELECOM', amount: 22_000, aliases: ['알뜰', 'mvno'] },
  { name: '인터넷+TV', icon: '🌐', category: 'TELECOM', amount: 33_000, aliases: ['인터넷', 'iptv', '와이파이'] },

  // ── 공과금 (amount=null: 매달 청구 금액이 다름) ──────────────
  { name: '관리비', icon: '🏢', category: 'UTILITY', amount: null, aliases: ['아파트관리비', '주거관리비'] },
  { name: '전기요금', icon: '💡', category: 'UTILITY', amount: null, aliases: ['한전', '한국전력'] },
  { name: '도시가스', icon: '🔥', category: 'UTILITY', amount: null, aliases: ['가스요금', '가스비'] },
  { name: '수도요금', icon: '💧', category: 'UTILITY', amount: null, aliases: ['상하수도', '수도세'] },

  // ── 렌탈 (Coway 등) ───────────────────────────────────────────
  { name: '정수기 렌탈', icon: '🚰', category: 'UTILITY', amount: 29_900, aliases: ['코웨이', 'coway', '정수기'] },
  { name: '공기청정기 렌탈', icon: '🌀', category: 'UTILITY', amount: 19_900, aliases: ['공청기'] },
  { name: '비데 렌탈', icon: '🚽', category: 'UTILITY', amount: 14_900, aliases: ['비데'] },
  { name: '매트리스 렌탈', icon: '🛏️', category: 'UTILITY', amount: 39_900, aliases: ['매트리스'] },

  // ── 보험 ──────────────────────────────────────────────────────
  { name: '실비보험', icon: '🏥', category: 'INSURANCE', amount: 35_000, aliases: ['실손보험', '실손의료'] },
  // 자동차보험은 연납이라 월 금액이 달라 amount=null
  { name: '자동차보험', icon: '🚗', category: 'INSURANCE', amount: null, aliases: ['자보', '차보험'] },
  { name: '종신보험', icon: '🛡️', category: 'INSURANCE', amount: 100_000, aliases: ['생명보험'] },
  { name: '암보험', icon: '🎗️', category: 'INSURANCE', amount: 50_000, aliases: ['건강보험상품'] },
  { name: '운전자보험', icon: '🚙', category: 'INSURANCE', amount: 25_000, aliases: ['운전자'] },

  // ── 교육 / 학원 ──────────────────────────────────────────────
  { name: '영어학원', icon: '📚', category: 'EDUCATION', amount: 250_000, aliases: ['영어', '어학원'] },
  { name: '수학학원', icon: '📐', category: 'EDUCATION', amount: 280_000, aliases: ['수학'] },
  { name: '피아노학원', icon: '🎹', category: 'EDUCATION', amount: 150_000, aliases: ['피아노'] },
  { name: '태권도', icon: '🥋', category: 'EDUCATION', amount: 130_000, aliases: ['도장', '태권도장'] },
  { name: '학습지', icon: '📖', category: 'EDUCATION', amount: 80_000, aliases: ['눈높이', '구몬', '빨간펜'] },

  // ── 의료 / 헬스 ──────────────────────────────────────────────
  { name: '헬스장', icon: '💪', category: 'HEALTHCARE', amount: 70_000, aliases: ['휘트니스', 'gym', '피트니스'] },
  { name: '필라테스', icon: '🤸', category: 'HEALTHCARE', amount: 180_000, aliases: ['pilates'] },
  { name: '요가', icon: '🧘', category: 'HEALTHCARE', amount: 120_000, aliases: ['yoga'] },

  // ── 주거 / 대출 (amount=null: 대출 잔액·금리 따라 매달 달라짐) ─
  { name: '월세', icon: '🏠', category: 'RENT', amount: null, aliases: ['집세', '임대료'] },
  { name: '전세대출 이자', icon: '🏦', category: 'LOAN', amount: null, aliases: ['전세이자', '전세대출'] },
  { name: '주택담보대출', icon: '🏘️', category: 'LOAN', amount: null, aliases: ['주담대', '모기지'] },
  { name: '신용대출 상환', icon: '💳', category: 'LOAN', amount: null, aliases: ['신용대출', '마이너스통장'] },
];

/**
 * 검색용 정규화: 소문자 변환 + 공백·중점(·)·플러스(+) 제거.
 * 사용자가 "넷 플릭스"처럼 띄어 써도, "LG U+"처럼 특수문자가 있어도 매칭된다.
 */
function norm(s: string): string {
  return s.toLowerCase().replace(/[\s·+]/g, '');
}

/**
 * 입력 문자열로 프리셋을 매칭한다.
 *
 * 점수 체계 (score):
 *   - 2점(prefix)  : 이름 또는 별칭이 입력으로 시작(앞에서 일치). 더 구체적인 의도로 간주해 상단 노출.
 *   - 1점(부분일치): 이름 또는 별칭 중간에 입력이 포함됨.
 *   - -1(제외)     : 이름·별칭 어디에도 없음.
 *
 * 같은 점수 내에서는 한국어 사전순(localeCompare)으로 정렬해 예측 가능한 순서를 유지한다.
 * 빈 입력이면 빈 배열 반환 — 모든 프리셋을 한꺼번에 노출하면 UX가 혼잡해지므로.
 *
 * @param input 사용자가 입력한 검색어
 * @param limit 반환할 최대 후보 수 (기본 6)
 */
export function matchPresets(input: string, limit = 6): MerchantPreset[] {
  const q = norm(input);
  if (!q) return [];

  const scored: Array<{ p: MerchantPreset; score: number }> = [];
  for (const p of MERCHANT_PRESETS) {
    const keys = [p.name, ...p.aliases].map(norm);
    let best = -1;
    for (const k of keys) {
      const idx = k.indexOf(q);
      if (idx === 0) best = Math.max(best, 2);       // prefix 일치 (2점)
      else if (idx > 0) best = Math.max(best, 1);    // 부분 일치 (1점)
    }
    if (best >= 0) scored.push({ p, score: best });
  }
  scored.sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name));
  return scored.slice(0, limit).map((s) => s.p);
}
