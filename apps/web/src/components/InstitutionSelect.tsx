/**
 * components/InstitutionSelect.tsx — 기관 선택 (은행/카드사)
 *
 * 셀렉트박스 + 직접 입력 전환 컴포넌트.
 * 프리셋 목록에 없는 기관(지역은행, 외국계 등)을 직접 입력할 수 있게 한다.
 *
 * 상태 전환:
 *   custom=false: 셀렉트박스 표시 → "✏️ 직접 입력" 선택 시 custom=true
 *   custom=true: 텍스트 입력 표시 → "목록에서" 버튼으로 custom=false
 *
 * 초기 상태 결정:
 *   value가 프리셋에 있거나 비어있으면 셀렉트(custom=false),
 *   프리셋에 없는 값이면 직접 입력(custom=true)으로 시작.
 *   편집 진입 시 기존에 직접 입력한 기관명을 그대로 보여주기 위함.
 */
import { useState } from 'react';
import { CUSTOM_OPTION } from '../lib/presets.js';

interface Props {
  presets: readonly string[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}
export function InstitutionSelect({ presets, value, onChange, placeholder }: Props) {
  const isPreset = !value || presets.includes(value as (typeof presets)[number]);
  const [custom, setCustom] = useState(isPreset);

  const selectValue = custom ? '' : presets.includes(value as (typeof presets)[number]) ? value : '';

  return (
    <div className="space-y-2">
      {!custom && (
        <select
          required
          value={selectValue}
          onChange={(e) => {
            const v = e.target.value;
            if (v === CUSTOM_OPTION) {
              setCustom(true);
              onChange('');
            } else {
              onChange(v);
            }
          }}
          className="w-full rounded-md border border-line bg-panel2 px-3 py-2"
        >
          <option value="">— 선택하세요 —</option>
          {presets.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
          <option value={CUSTOM_OPTION}>✏️ 직접 입력</option>
        </select>
      )}
      {custom && (
        <div className="flex gap-2">
          <input
            required
            autoFocus
            placeholder={placeholder ?? '이름 직접 입력'}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="flex-1 rounded-md border border-line bg-panel2 px-3 py-2"
          />
          <button
            type="button"
            onClick={() => { setCustom(false); onChange(''); }}
            className="rounded-md border border-line px-3 text-xs text-dim"
          >
            목록에서
          </button>
        </div>
      )}
    </div>
  );
}
