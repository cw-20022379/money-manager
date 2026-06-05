import { useState } from 'react';
import { CUSTOM_OPTION } from '../lib/presets.js';

interface Props {
  presets: readonly string[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

/**
 * 셀렉트박스 + 직접 입력 폴백.
 * 프리셋에 있으면 셀렉트로 표시, 없으면 자유 입력 필드 노출.
 */
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
