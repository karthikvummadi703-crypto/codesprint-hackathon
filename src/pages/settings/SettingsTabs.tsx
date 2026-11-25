/** Settings section tabs with arrow-key navigation. */
import type { useSettings } from './useSettings';

type Props = Pick<ReturnType<typeof useSettings>, 'activeTab' | 'setActiveTab' | 'tabs' | 'handleTabKeyDown'>;

export default function SettingsTabs({ activeTab, setActiveTab, tabs, handleTabKeyDown }: Props) {
  return (
    <div
      role="tablist"
      aria-label="Settings sections"
      aria-orientation="vertical"
      className="w-full md:w-64 shrink-0 flex md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-2 md:pb-0"
    >
      {tabs.map((tab, index) => {
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            id={`settings-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls="settings-panel"
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all shrink-0 ${
              activeTab === tab.id
                ? 'bg-brand-600 text-white shadow-sm'
                : 'bg-white border border-slate-200/50 hover:bg-slate-50 text-slate-600'
            }`}
          >
            <Icon className="h-4.5 w-4.5" aria-hidden="true" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
