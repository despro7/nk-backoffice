import { DynamicIcon } from 'lucide-react/dynamic';
import type { LalPresetId } from '@shared/types/lalAudiences';
import { LAL_PRESET_OPTIONS } from '../LalAudiencesUtils';

interface LalPresetsPanelProps {
  selected: LalPresetId | null;
  onToggle: (id: LalPresetId) => void;
}

export default function LalPresetsPanel({ selected, onToggle }: LalPresetsPanelProps) {
  return (
    <div className="bg-white rounded-xl p-4">
      <h2 className="text-sm font-semibold text-default-800 mb-3">Швидкі сегменти</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {LAL_PRESET_OPTIONS.map((preset) => {
          const isActive = selected === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onToggle(preset.id)}
              aria-pressed={isActive}
              className={`flex flex-col items-start gap-3 rounded-md border px-3 py-2.5 text-left transition-colors ${
                isActive
                  ? 'border-blue-600/20 bg-blue-400/15'
                  : 'border-neutral-200 hover:border-neutral-300 hover:bg-default-50'
              }`}
            >
              {preset.emoji && <span className="text-2xl">{preset.emoji}</span>}
              {/* <DynamicIcon
                name={preset.icon}
                size={18}
                className={`shrink-0 ${isActive ? 'text-blue-800' : 'text-default-400'}`}
              /> */}
              <span className="flex flex-col gap-1">
                <span className={`block text-sm leading-tight font-medium ${isActive ? 'text-blue-800' : 'text-default-800'}`}>
                  {preset.title}
                </span>
                <span className={`block text-xs leading-tight ${isActive ? 'text-blue-900/40' : 'text-default-400'}`}>{preset.description}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
