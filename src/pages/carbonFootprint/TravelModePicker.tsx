import { TRAVEL_MODE_ICONS } from '../../services/carbonConstants';
import { TravelMode } from '../../types';
import { TRAVEL_MODES } from './tripUtils';

interface TravelModePickerProps {
  selectedMode: TravelMode;
  onSelectMode: (mode: TravelMode) => void;
}

export function TravelModePicker({ selectedMode, onSelectMode }: TravelModePickerProps) {
  return (
    <div
      role="group"
      aria-labelledby="travel-mode-label"
      className="grid grid-cols-3 sm:grid-cols-7 gap-2"
    >
      {TRAVEL_MODES.map(mode => (
        <button
          key={mode}
          type="button"
          aria-pressed={selectedMode === mode}
          onClick={() => onSelectMode(mode)}
          className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all text-xs font-semibold ${
            selectedMode === mode
              ? 'border-brand-600 bg-brand-50 text-brand-800'
              : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
          }`}
        >
          <span className="text-xl mb-1">{TRAVEL_MODE_ICONS[mode]}</span>
          <span>{mode}</span>
        </button>
      ))}
    </div>
  );
}
