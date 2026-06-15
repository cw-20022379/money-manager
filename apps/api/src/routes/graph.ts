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

    // 트리 구조
    const tree = accounts.map((acc) => {
      const childCards = cards.filter((c) => c.billing_account_id === acc.id);
      const directFlows = flows.filter((f) => f.source_account_id === acc.id);

      const cardNodes = childCards.map((card) => {
        const cardFlows = flows.filter((f) => f.source_card_id === card.id);
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
    const orphanCards = cards.filter((c) => !c.billing_account_id);

    // 홈 합산 (P5): 활성 정기지출 amount 합 + draft 카운트
    const fixedSum = flows
      .filter((f) => !f.is_draft && f.amount_krw)
      .reduce((s, f) => s + (f.amount_krw ?? 0), 0);
    const activeCount = flows.filter((f) => !f.is_draft).length;
    const draftCount = flows.filter((f) => f.is_draft).length;

    // 다음 3일 (단순 계산: schedule_day가 오늘부터 +3일 이내)
    const today = new Date();
    const upcoming = flows
      .filter((f) => !f.is_draft)
      .map((f) => {
        const day = f.schedule_day;
        const month = today.getDate() > day ? today.getMonth() + 1 : today.getMonth();
        const due = new Date(today.getFullYear(), month, day);
        const diffDays = Math.floor((due.getTime() - today.getTime()) / 86_400_000);
        return { ...f, due_date: due.toISOString().slice(0, 10), diff_days: diffDays };
      })
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
