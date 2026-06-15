/**
 * features/BillingCycle.tsx — 카드 청구 사이클 뷰
 *
 * 핵심 개념: 카드를 긁는 날(schedule_day)과 통장에서 빠지는 날(payment_due_day)은 다르다.
 *   - schedule_day: 정기지출이 발생하는 날 (카드 승인 또는 자동이체 출금일).
 *   - payment_due_day: 카드사가 이달 사용분을 결제계좌에서 인출하는 날.
 *
 * 이 화면은 payment_due_day 기준으로 카드별로 묶어 "통장서 한 번에 빠질 금액"을 보여준다.
 * 예: 5일에 넷플릭스(카드 긁음), 10일에 쿠팡(카드 긁음) → 25일에 카드사가 합산 인출.
 *
 * 잔액 부족 경고: account.balance_krw < card.monthly_sum이면 빨간 경고 배너 표시.
 *
 * 노드 클릭 → openCard(): sessionStorage에 카드 id → /list 이동 → List가 카드 편집 모달 오픈.
 * (sessionStorage 라우팅 브릿지 패턴)
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { CATEGORY_LABEL } from '@ffn/shared';
import { krw, krwShort } from '../lib/format.js';
import type { GraphData } from './RelationshipGraph.js';

type AccountNode = GraphData['tree'][number];
type CardNode = AccountNode['cards'][number];

interface Props {
  data: GraphData;
}

/**
 * 오늘 기준 매월 N일 결제일까지 남은 일수를 계산한다.
 * 오늘이 결제일 이후면 다음 달 결제일을 기준으로 계산한다.
 * D-0이면 "오늘 결제"로 표시된다.
 */
function daysUntil(day: number, today: Date): number {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const month = today.getDate() > day ? today.getMonth() + 1 : today.getMonth();
  const due = new Date(today.getFullYear(), month, day);
  return Math.round((due.getTime() - start.getTime()) / 86_400_000);
}

interface BillingCard {
  card: CardNode;
  account: AccountNode;
  due: number; // 청구 예정액 (draft 제외, = monthly_sum)
}

export function BillingCycle({ data }: Props) {
  const today = new Date();
  const navigate = useNavigate();

  // 결제계좌가 연결된 카드만 청구 사이클 대상
  const billingCards: BillingCard[] = useMemo(() => {
    const out: BillingCard[] = [];
    for (const acc of data.tree) {
      for (const card of acc.cards) {
        out.push({ card, account: acc, due: card.monthly_sum });
      }
    }
    // 결제일 빠른 순 → 금액 큰 순
    return out.sort((a, b) => {
      const da = a.card.payment_due_day ?? 99;
      const db = b.card.payment_due_day ?? 99;
      if (da !== db) return da - db;
      return b.due - a.due;
    });
  }, [data]);

  const totalDue = billingCards.reduce((s, b) => s + b.due, 0);

  function openCard(id: string) {
    sessionStorage.setItem('ffn:edit-card', id);
    navigate('/list');
  }

  if (billingCards.length === 0) {
    return (
      <div className="bs-card p-6 text-center text-sm text-dim">
        결제계좌에 연결된 카드가 없어요.<br />
        목록 탭에서 카드를 등록하고 결제계좌·결제일을 지정하면<br />
        여기서 카드별 청구 예정액을 묶어서 보여드려요.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 이번달 카드 청구 합계 */}
      <section className="bs-card p-4">
        <div className="text-xs text-dim">💳 이번달 카드로 빠질 돈</div>
        <div className="num mt-0.5 text-2xl font-bold text-body">{krw(totalDue)}</div>
        <div className="mt-0.5 text-xs text-dim">카드 {billingCards.length}장 · 결제일에 통장에서 한 번에 빠져요</div>
      </section>

      {billingCards.map(({ card, account, due }) => {
        const dday = card.payment_due_day != null ? daysUntil(card.payment_due_day, today) : null;
        const realFlows = card.children.filter((f) => !f.is_draft);
        const shortFall = account.balance_krw != null && due > account.balance_krw;
        return (
          <section key={card.id} className="bs-card overflow-hidden">
            {/* 카드 헤더 */}
            <button onClick={() => openCard(card.id)}
              className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-panel2/60">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-body">
                  💳 {card.issuer_name} {card.product_name}
                </div>
                <div className="mt-0.5 text-xs text-dim">
                  {card.payment_due_day != null
                    ? <>매월 {card.payment_due_day}일 결제 · {account.institution_name} {account.nickname}</>
                    : <>결제일 미설정 · {account.institution_name} {account.nickname}</>}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="num text-base font-bold text-body">{krw(due)}</div>
                {dday != null && (
                  <span className={`inline-block rounded px-1.5 text-[11px] ${
                    dday === 0 ? 'bg-bad/15 text-bad' : dday <= 3 ? 'bg-warn/15 text-warn' : 'bg-teal/15 text-teal'
                  }`}>
                    {dday === 0 ? '오늘 결제' : `D-${dday}`}
                  </span>
                )}
              </div>
            </button>

            {/* 잔액 부족 경고 */}
            {shortFall && (
              <div className="mx-4 mb-2 rounded-md border border-bad/40 bg-bad/10 px-2 py-1.5 text-[11px] text-bad">
                ⚠️ {account.nickname} 잔액({krwShort(account.balance_krw)}원)보다 청구액이 커요. 결제일 전 확인하세요.
              </div>
            )}

            {/* 포함된 정기지출 */}
            <div className="border-t border-line px-4 py-2">
              {realFlows.length === 0 ? (
                <div className="py-1 text-xs text-dim">이 카드에 연결된 정기지출이 없어요.</div>
              ) : (
                <ul className="space-y-1">
                  {realFlows.map((f) => (
                    <li key={f.id} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 text-body">
                        <span className="text-dim">{f.schedule_day}일</span>
                        {f.merchant_name}
                        <span className="cat-badge bg-panel2 text-dim">{CATEGORY_LABEL[f.category]}</span>
                      </span>
                      <span className="num text-dim">{krw(f.amount_krw)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        );
      })}

      <p className="px-1 text-[11px] text-dim">
        💡 카드를 긁는 날(위 정기지출 날짜)과 통장에서 빠지는 날(결제일)은 달라요.
        이 화면은 결제일에 통장에서 한 번에 빠지는 금액을 카드별로 묶어 보여줍니다.
      </p>
    </div>
  );
}
