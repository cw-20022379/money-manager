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

/** schedule_day가 월 마지막 날을 넘으면 마지막 날로 fallback. */
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
  const firstWeekday = new Date(year, month, 1).getDay(); // 0=일

  /** day(1-31) → flows[] */
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

  /** day → 합계 */
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

  /** 그리드 셀: 앞쪽 빈칸 + 1..last + 6주차 채우기 */
  const cells: Array<{ day: number | null; pad?: boolean }> = [];
  for (let i = 0; i < firstWeekday; i++) cells.push({ day: null, pad: true });
  for (let d = 1; d <= last; d++) cells.push({ day: d });
  while (cells.length % 7 !== 0) cells.push({ day: null, pad: true });

  const monthLabel = `${year}년 ${month + 1}월`;
  const selected = selectedDay != null ? byDay.get(selectedDay) ?? [] : [];

  return (
    <div className="space-y-3">
      {/* 헤더: 월 이동 + 요약 */}
      <header className="flex items-center justify-between rounded-xl border border-line bg-panel p-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCursor(new Date(year, month - 1, 1))}
            className="rounded-md border border-line px-2 py-1 text-sm text-dim hover:border-teal"
          >‹</button>
          <div className="min-w-[100px] text-center text-sm font-semibold text-teal">{monthLabel}</div>
          <button
            onClick={() => setCursor(new Date(year, month + 1, 1))}
            className="rounded-md border border-line px-2 py-1 text-sm text-dim hover:border-teal"
          >›</button>
          {!isCurrentMonth && (
            <button
              onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
              className="ml-1 rounded-md bg-teal/20 px-2 py-1 text-xs text-teal"
            >오늘</button>
          )}
        </div>
        <div className="text-right text-xs">
          <div className="text-dim">월 합계</div>
          <div className="font-semibold">{krw(monthTotal)}</div>
          {remaining != null && (
            <div className="text-warn">남은 {krw(remaining)}</div>
          )}
        </div>
      </header>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-dim">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={i === 0 ? 'text-bad' : i === 6 ? 'text-teal' : ''}>{w}</div>
        ))}
      </div>

      {/* 그리드 */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, i) => {
          if (cell.pad) return <div key={i} className="aspect-square rounded-md bg-panel/30" />;
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
              className={`flex aspect-square flex-col items-stretch justify-between rounded-md border p-1 text-left text-[10px] ${
                isSelected ? 'border-teal bg-teal/10'
                  : isToday ? 'border-teal/50 bg-panel'
                    : items.length > 0 ? `${tone.border} bg-panel`
                      : 'border-line/40 bg-panel/40'
              }`}
            >
              <div className={`flex items-center justify-between ${isToday ? 'text-teal font-semibold' : 'text-dim'}`}>
                <span>{day}</span>
                {items.length > 0 && (
                  <span className={`rounded-full px-1 ${tone.dot}`}>{items.length}</span>
                )}
              </div>
              {items.length > 0 && (
                <div className={`text-right text-[10px] leading-tight ${tone.text}`}>
                  {krwShort(sum)}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* 선택된 날짜 상세 */}
      {selectedDay != null && (
        <section className="rounded-xl border border-teal/50 bg-panel p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold text-teal">
              {monthLabel} {selectedDay}일 빠질 돈
            </div>
            <button onClick={() => setSelectedDay(null)} className="text-xs text-dim">닫기 ✕</button>
          </div>
          {selected.length === 0 ? (
            <div className="py-2 text-center text-xs text-dim">이 날 빠질 돈은 없어요.</div>
          ) : (
            <div className="space-y-1.5">
              {selected.map((f) => (
                <button
                  key={f.id}
                  onClick={() => {
                    sessionStorage.setItem('ffn:edit-flow', f.id);
                    navigate('/list');
                  }}
                  className="flex w-full items-center justify-between rounded-md border border-line bg-panel2 px-2 py-1.5 text-left text-sm hover:border-teal"
                >
                  <div>
                    <div>{f.merchant_name}</div>
                    <div className="text-[11px] text-dim">{CATEGORY_LABEL[f.category]}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm">{f.amount_is_variable ? '변동' : krw(f.amount_krw)}</div>
                    <div className="text-[10px] text-dim">{f.source_card_id ? '💳 카드' : '🏦 자동이체'}</div>
                  </div>
                </button>
              ))}
              <div className="mt-1 flex justify-between border-t border-line pt-1.5 text-xs">
                <span className="text-dim">합계</span>
                <span className="font-semibold text-teal">{krw(sumByDay.get(selectedDay) ?? 0)}</span>
              </div>
            </div>
          )}
        </section>
      )}

      {flows.length > 0 && byDay.size === 0 && (
        <div className="rounded-xl border border-dashed border-line bg-panel/40 p-4 text-center text-xs text-dim">
          이번 달은 모두 초안이라 표시할 항목이 없어요.
        </div>
      )}
    </div>
  );
}

function cellTone(sum: number): { border: string; dot: string; text: string } {
  if (sum >= 100_000) return { border: 'border-bad/50', dot: 'bg-bad/30 text-bad', text: 'text-bad' };
  if (sum >= 50_000) return { border: 'border-warn/50', dot: 'bg-warn/30 text-warn', text: 'text-warn' };
  if (sum > 0) return { border: 'border-teal/40', dot: 'bg-teal/20 text-teal', text: 'text-teal' };
  return { border: 'border-line', dot: 'bg-panel2 text-dim', text: 'text-dim' };
}
