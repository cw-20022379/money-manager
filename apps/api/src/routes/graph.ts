/**
 * routes/graph.ts — 가족 자산 관계 그래프 API
 *
 * 트리뷰(S05)와 홈 인포그래픽(S04) 양쪽이 같이 쓰는 데이터.
 * 계좌(루트) → 카드(billing_account_id로 연결) → 정기지출(머천트)
 * + 계좌에 직접 연결된 정기지출(자동이체)
 *
 * ★ 트리 구조 구성 로직:
 *   DB 조인 대신 JS에서 메모리 조인을 선택한 이유:
 *   1. 데이터량이 가족 단위라 소수 — 계좌 수십, 카드 수십, 정기지출 수십 건.
 *   2. 트리 중첩 구조를 SQL로 표현하면 복잡한 CTE가 필요하고 유지보수가 어렵다.
 *   3. JS 메모리 조인이 충분히 빠르고 코드가 훨씬 읽기 쉽다.
 *
 * orphan_cards (고아 카드):
 *   billing_account_id가 null인 카드 — 결제 계좌가 아직 연결되지 않은 상태.
 *   트리에서 어디에도 속하지 않으므로 별도 목록으로 노출.
 *   UI에서 "이 카드는 결제 계좌가 없어요" 안내를 보여줄 수 있다.
 *
 * monthly_sum 집계에서 is_draft 제외:
 *   draft(임시 항목)는 금액이 미확정이므로 집계에 포함하면 수치가 왜곡된다.
 *   amount_krw가 null인 항목도 집계 제외 (amount_is_variable=true인 경우).
 *
 * 다음 3일 upcoming 계산 로직:
 *   schedule_day를 이번 달 또는 다음 달로 해석해 실제 날짜를 구한다.
 *   오늘(today.getDate())보다 schedule_day가 크거나 같으면 이번 달,
 *   이미 지났으면 다음 달로 계산. (예: 오늘이 18일이고 schedule_day=10이면 다음 달 10일)
 *   주의: 31일 같은 큰 날짜가 월말이 짧은 달에 걸리면 다음 달로 넘어갈 수 있다
 *         (JS Date의 자동 overflow 특성). 이 edge case는 v0.1.1에서 허용.
 *   diff_days가 0~3인 항목만 추출 → 최대 3건 표시.
 *
 * P5 홈 합산 메타:
 *   fixed_sum: 이번 달 확정된 정기지출 총액 (draft 제외, amount_krw null 제외).
 *   active_count: 활성 정기지출 수 (draft 제외).
 *   draft_count: 임시 항목 수 (사용자에게 "미완성 항목 N개" 안내용).
 */
import type { FastifyPluginAsync } from 'fastify';
import { supabaseAdmin } from '../db.js';

interface Account { id: string; nickname: string; institution_name: string; balance_krw: number | null; owner_user_id: string | null }
interface Card {
  id: string; product_name: string; issuer_name: string;
  billing_account_id: string | null; owner_user_id: string | null;
  payment_due_day: number | null; payment_due_month_offset: number | null;
}
interface Flow {
  id: string;
  merchant_name: string;
  category: string;
  flow_kind: string;
  amount_krw: number | null;
  schedule_day: number;
  source_account_id: string | null;
  source_card_id: string | null;
  is_draft: boolean;
}

/**
 * 트리뷰(S05)와 정적 인포그래픽(S04) 양쪽이 같이 쓰는 데이터.
 * 계좌(루트) → 카드(billing_account_id로 연결) → 정기지출(머천트)
 * + 카드에 연결된 정기지출
 * + 계좌에 직접 연결된 정기지출(자동이체)
 *
 * P5: 홈 합산용 메타도 같이 제공 (이번 달 빠질 돈 SUM).
 */
export const graphRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/graph', async (req) => {
    const familyId = req.familyId!;

    // 세 테이블을 병렬 조회 — 순서 의존성 없으므로 Promise.all로 최적화
    const [accountsRes, cardsRes, flowsRes] = await Promise.all([
      supabaseAdmin
        .from('accounts')
        .select('id, nickname, institution_name, balance_krw, owner_user_id')
        .eq('family_id', familyId)
        .is('deleted_at', null),
      supabaseAdmin
        .from('cards')
        .select('id, product_name, issuer_name, billing_account_id, owner_user_id, payment_due_day, payment_due_month_offset')
        .eq('family_id', familyId)
        .is('deleted_at', null),
      supabaseAdmin
        .from('payment_flows')
        .select(
          'id, merchant_name, category, flow_kind, amount_krw, schedule_day, source_account_id, source_card_id, is_draft',
        )
        .eq('family_id', familyId)
        .eq('status', 'ACTIVE')
        .is('deleted_at', null),
    ]);

    const accounts = (accountsRes.data ?? []) as Account[];
    const cards = (cardsRes.data ?? []) as Card[];
    const flows = (flowsRes.data ?? []) as Flow[];

    // 계좌 → 카드 → 정기지출 트리를 JS 메모리 조인으로 구성
    // DB 조인 대신 JS 조인을 쓰는 이유: 가족 단위 데이터라 소량이고, 트리 구조를 SQL로 표현하기 복잡
    const tree = accounts.map((acc) => {
      // 이 계좌를 결제 계좌로 쓰는 카드들
      const childCards = cards.filter((c) => c.billing_account_id === acc.id);
      // 이 계좌에서 직접 자동이체되는 정기지출 (카드 없이 계좌로 바로 출금)
      const directFlows = flows.filter((f) => f.source_account_id === acc.id);

      const cardNodes = childCards.map((card) => {
        const cardFlows = flows.filter((f) => f.source_card_id === card.id);
        // is_draft 제외 + amount_krw null 제외 — 확정 금액만 합산
        const cardMonthly = cardFlows
          .filter((f) => !f.is_draft && f.amount_krw)
          .reduce((s, f) => s + (f.amount_krw ?? 0), 0);
        return {
          kind: 'CARD' as const,
          ...card,
          monthly_sum: cardMonthly,
          children: cardFlows,
        };
      });

      const directMonthly = directFlows
        .filter((f) => !f.is_draft && f.amount_krw)
        .reduce((s, f) => s + (f.amount_krw ?? 0), 0);
      // 계좌의 monthly_sum = 직접 자동이체 합 + 이 계좌로 청구되는 카드들의 합
      const cardsMonthly = cardNodes.reduce((s, c) => s + c.monthly_sum, 0);

      return {
        kind: 'ACCOUNT' as const,
        ...acc,
        monthly_sum: directMonthly + cardsMonthly,
        cards: cardNodes,
        direct_flows: directFlows,
      };
    });

    // 어디에도 연결 안 된 카드(예: billing_account_id null)
    // 결제 계좌를 아직 연결하지 않은 카드. UI에서 별도 안내 필요.
    const orphanCards = cards.filter((c) => !c.billing_account_id);

    // 홈 합산 (P5): 활성 정기지출 amount 합 + draft 카운트
    const fixedSum = flows
      .filter((f) => !f.is_draft && f.amount_krw)
      .reduce((s, f) => s + (f.amount_krw ?? 0), 0);
    const activeCount = flows.filter((f) => !f.is_draft).length;
    const draftCount = flows.filter((f) => f.is_draft).length;

    // 다음 3일 이내 결제 예정 항목 계산
    // schedule_day를 이번 달 또는 다음 달로 해석 (오늘보다 이미 지났으면 다음 달)
    const today = new Date();
    // 오늘 자정 기준점. due(해당 날짜 자정)와 같은 자정끼리 빼야 일수가 정확하다.
    // (today의 시·분을 그대로 쓰면 "오늘 결제"가 due=오늘자정보다 과거가 되어 -1로 빠지는 버그)
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const upcoming = flows
      .filter((f) => !f.is_draft)
      .map((f) => {
        const day = f.schedule_day;
        // 오늘 날짜가 schedule_day보다 크면 이미 이번 달은 지났으므로 다음 달로
        const month = today.getDate() > day ? today.getMonth() + 1 : today.getMonth();
        const due = new Date(today.getFullYear(), month, day);
        // 자정끼리의 차이라 정수일. 오늘 결제면 0, 내일이면 1.
        const diffDays = Math.round((due.getTime() - todayMidnight.getTime()) / 86_400_000);
        return { ...f, due_date: due.toISOString().slice(0, 10), diff_days: diffDays };
      })
      // 오늘(0) ~ 3일 후까지만, 가장 가까운 순으로 정렬, 최대 3건
      .filter((f) => f.diff_days >= 0 && f.diff_days <= 3)
      .sort((a, b) => a.diff_days - b.diff_days)
      .slice(0, 3);

    return {
      tree,
      orphan_cards: orphanCards,
      summary: {
        fixed_sum: fixedSum,
        active_count: activeCount,
        draft_count: draftCount,
        upcoming,
      },
    };
  });
};
