/**
 * features/CashflowCalendar.tsx — 현금흐름 캘린더 뷰
 *
 * 월 그리드(7열) 형태로 정기지출 결제일을 시각화한다.
 *
 * resolveDay(scheduleDay, year, month):
 *   31일짜리 정기지출이 2월(28/29일)처럼 짧은 달에 오면 마지막 날로 클램프한다.
 *   예: schedule_day=31인 항목 → 2월에는 28/29일로 표시.
 *
 * 셀 색상(cellTone):
 *   해당 날 합산 금액에 따라 색을 달리한다.
 *   0원: 회색 / 1원~4.9만원: 그린 / 5만원~9.9만원: 앰버 / 10만원 이상: 레드.
 *   시각적으로 큰 지출일을 강조해 결제일 전 확인을 유도한다.
 *
 * 날짜 클릭 → selectedDay:
 *   해당 날의 정기지출 목록을 하단 패널에 표시.
 *   항목 클릭 → sessionStorage ffn:edit-flow + /list 이동 (라우팅 브릿지 패턴).
 *
 * remaining:
 *   현재 월에서만 계산. 오늘 이후 남은 결제액 합산. 이번달 얼마나 남았는지 표시.
 *
 * 셀 배열 생성:
 *   월 1일의 요일(firstWeekday)만큼 패딩 셀을 앞에 넣어 그리드를 맞춘다.
 *   마지막 주가 7의 배수가 되도록 뒤에도 패딩 추가.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CATEGORY_LABEL, type Category } from '@ffn/shared';
import { krw, krwShort } from '../lib/format.js';

export interface CalFlow {
  id: string;
  merchant_name: string;
  category: Category;
  amount_krw: number | null;
  amount_is_variable: boolean;
  schedule_day: number;
  source_account_id: string | null;
  source_card_id: string | null;
  is_draft: boolean;
}

interface Props {
  flows: CalFlow[];
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * 정기지출의 schedule_day를 실제 해당 월의 유효한 날짜로 변환한다.
 * 31일인 정기지출이 30일짜리 달(4,6,9,11월)이나 2월에 올 때 마지막 날로 클램프.
 */
function resolveDay(scheduleDay: number, year: number, month: number): number {
  const last = lastDayOfMonth(year, month);
  return Math.min(scheduleDay, last);
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function CashflowCalendar({ flows }: Props) {
  const today = new Date();
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const navigate = useNavigate();

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const last = lastDayOfMonth(year, month);
  const firstWeekday = new Date(year, month, 1).getDay();

  const byDay = useMemo(() => {
    const map = new Map<number, CalFlow[]>();
    for (const f of flows) {
      if (f.is_draft) continue;
      const d = resolveDay(f.schedule_day, year, month);
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(f);
    }
    return map;
  }, [flows, year, month]);

  const sumByDay = useMemo(() => {
    const m = new Map<number, number>();
    for (const [day, list] of byDay) {
      m.set(day, list.reduce((s, f) => s + (f.amount_krw ?? 0), 0));
    }
    return m;
  }, [byDay]);

  const monthTotal = useMemo(
    () => Array.from(sumByDay.values()).reduce((s, v) => s + v, 0),
    [sumByDay],
  );

  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
  const remaining = useMemo(() => {
    if (!isCurrentMonth) return null;
    const todayD = today.getDate();
    let sum = 0;
    for (const [day, total] of sumByDay) {
      if (day >= todayD) sum += total;
    }
    return sum;
  }, [sumByDay, isCurrentMonth]);

  const cells: Array<{ day: number | null; pad?: boolean }> = [];
  for (let i = 0; i < firstWeekday; i++) cells.push({ day: null, pad: true });
  for (let d = 1; d <= last; d++) cells.push({ day: d });
  while (cells.length % 7 !== 0) cells.push({ day: null, pad: true });

  const monthLabel = `${year}년 ${month + 1}월`;
  const selected = selectedDay != null ? byDay.get(selectedDay) ?? [] : [];

  return (
    <div className="space-y-3">
      {/* 헤더 */}
      <header className="rounded-xl bg-white border border-line shadow-card p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCursor(new Date(year, month - 1, 1))}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-dim hover:border-teal/40 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <div className="min-w-[100px] text-center text-[14px] font-bold text-body" style={{ letterSpacing: '-0.02em' }}>
              {monthLabel}
            </div>
            <button
              onClick={() => setCursor(new Date(year, month + 1, 1))}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-dim hover:border-teal/40 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {!isCurrentMonth && (
              <button
                onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
                className="rounded-full px-2 py-1 text-[10px] font-medium transition-colors"
                style={{ background: '#f0fdf4', color: '#00d2c4' }}
              >
                오늘
              </button>
            )}
          </div>
          <div className="text-right">
            <div className="text-[11px] text-dim">월 합계</div>
            <div className="text-[13px] font-bold tabular-nums text-body">{krw(monthTotal)}</div>
            {remaining != null && (
              <div className="text-[11px] font-medium tabular-nums" style={{ color: '#f59e0b' }}>
                남은 {krwShort(remaining)}원
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium">
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            style={{
              color: i === 0 ? '#ef4444' : i === 6 ? '#00d2c4' : '#94a3b8',
            }}
          >
            {w}
          </div>
        ))}
      </div>

      {/* 캘린더 그리드 */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, i) => {
          if (cell.pad) return <div key={i} className="aspect-square rounded-lg" style={{ background: '#f8fafc' }} />;
          const day = cell.day!;
          const sum = sumByDay.get(day) ?? 0;
          const items = byDay.get(day) ?? [];
          const cellDate = new Date(year, month, day);
          const isToday = isSameDay(cellDate, today);
          const isSelected = selectedDay === day;
          const tone = cellTone(sum);

          return (
            <button
              key={i}
              onClick={() => setSelectedDay(isSelected ? null : day)}
              className="flex aspect-square flex-col items-stretch justify-between rounded-lg p-1 text-left transition-all duration-150"
              style={{
                background: isSelected
                  ? '#f0fdf4'
                  : isToday
                  ? '#f0fdf4'
                  : items.length > 0
                  ? '#ffffff'
                  : '#f8fafc',
                border: `1px solid ${
                  isSelected
                    ? '#00d2c4'
                    : isToday
                    ? '#bbf7d0'
                    : items.length > 0
                    ? tone.borderColor
                    : '#f1f5f9'
                }`,
              }}
            >
              <div className="flex items-center justify-between">
                <span
                  className="text-[10px] font-semibold"
                  style={{
                    color: isToday ? '#00d2c4' : '#1c1f26',
                  }}
                >
                  {day}
                </span>
                {items.length > 0 && (
                  <span
                    className="rounded-full px-1 text-[9px] font-bold"
                    style={{ background: tone.dotBg, color: tone.dotColor }}
                  >
                    {items.length}
                  </span>
                )}
              </div>
              {items.length > 0 && (
                <div
                  className="text-right text-[9px] leading-tight font-semibold tabular-nums"
                  style={{ color: tone.amountColor }}
                >
                  {krwShort(sum)}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* 선택된 날짜 상세 */}
      {selectedDay != null && (
        <section className="rounded-xl bg-white border shadow-card p-3" style={{ borderColor: '#00d2c4' }}>
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[13px] font-bold text-body" style={{ letterSpacing: '-0.02em' }}>
              {monthLabel} {selectedDay}일
            </div>
            <button
              onClick={() => setSelectedDay(null)}
              className="flex h-6 w-6 items-center justify-center rounded-full text-dim2 hover:bg-panel2 transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
          {selected.length === 0 ? (
            <div className="py-2 text-center text-[12px] text-dim">이 날 빠질 돈은 없어요.</div>
          ) : (
            <div className="space-y-1.5">
              {selected.map((f) => (
                <button
                  key={f.id}
                  onClick={() => {
                    sessionStorage.setItem('ffn:edit-flow', f.id);
                    navigate('/list');
                  }}
                  className="flex w-full items-center justify-between rounded-lg border border-line bg-panel px-3 py-2 text-left hover:border-teal/40 transition-colors"
                >
                  <div>
                    <div className="text-[12px] font-semibold text-body">{f.merchant_name}</div>
                    <div className="text-[10px] text-dim mt-0.5">{CATEGORY_LABEL[f.category]}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[12px] font-bold tabular-nums text-body">
                      {f.amount_is_variable ? '변동' : krw(f.amount_krw)}
                    </div>
                    <div className="text-[10px] text-dim mt-0.5">
                      {f.source_card_id ? '카드' : '자동이체'}
                    </div>
                  </div>
                </button>
              ))}
              <div className="mt-1 flex justify-between border-t border-line pt-2 text-[11px]">
                <span className="text-dim">합계</span>
                <span className="font-bold tabular-nums" style={{ color: '#00d2c4' }}>
                  {krw(sumByDay.get(selectedDay) ?? 0)}
                </span>
              </div>
            </div>
          )}
        </section>
      )}

      {flows.length > 0 && byDay.size === 0 && (
        <div
          className="rounded-xl border border-dashed p-4 text-center text-[12px] text-dim"
          style={{ borderColor: '#cbd5e1', background: '#f8fafc' }}
        >
          이번 달은 모두 초안이라 표시할 항목이 없어요.
        </div>
      )}
    </div>
  );
}

function cellTone(sum: number): {
  borderColor: string;
  dotBg: string;
  dotColor: string;
  amountColor: string;
} {
  if (sum >= 100_000) return {
    borderColor: '#fecaca',
    dotBg: '#fef2f2',
    dotColor: '#ef4444',
    amountColor: '#ef4444',
  };
  if (sum >= 50_000) return {
    borderColor: '#fde68a',
    dotBg: '#fef3c7',
    dotColor: '#f59e0b',
    amountColor: '#f59e0b',
  };
  if (sum > 0) return {
    borderColor: '#bbf7d0',
    dotBg: '#f0fdf4',
    dotColor: '#00d2c4',
    amountColor: '#00d2c4',
  };
  return {
    borderColor: '#e2e8f0',
    dotBg: '#f8fafc',
    dotColor: '#94a3b8',
    amountColor: '#94a3b8',
  };
}
