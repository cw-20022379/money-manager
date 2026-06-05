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
          className="w-full rounded border border-line bg-bg px-3 py-2 text-[#37352f] focus:border-teal focus:outline-none transition-colors"
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
            className="flex-1 rounded border border-line bg-bg px-3 py-2 text-[#37352f] placeholder:text-[#9b9a97] focus:border-teal focus:outline-none transition-colors"
          />
          <button
            type="button"
            onClick={() => { setCustom(false); onChange(''); }}
            className="rounded border border-line px-3 text-xs text-[#787774] hover:bg-[#f7f6f3] transition-colors"
          >
            목록에서
          </button>
        </div>
      )}
    </div>
  );
}
