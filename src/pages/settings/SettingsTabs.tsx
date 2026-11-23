import { User, Settings, Bell, Shield } from 'lucide-react';
import type { SettingsTab } from './types';

const tabs: { id: SettingsTab; label: string; icon: typeof User }[] = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'preferences', label: 'Preferences', icon: Settings },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'privacy', label: 'Privacy & Security', icon: Shield },
];

interface SettingsTabsProps {
  activeTab: SettingsTab;
  onSelect: (tab: SettingsTab) => void;
}

export function SettingsTabs({ activeTab, onSelect }: SettingsTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Settings sections"
      aria-orientation="vertical"
      className="w-full md:w-64 shrink-0 flex md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-2 md:pb-0"
    >
      {tabs.map(tab => {
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls="settings-panel"
            onClick={() => onSelect(tab.id)}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all shrink-0 ${
              activeTab === tab.id
                ? 'bg-brand-600 text-white shadow-sm'
                : 'bg-white border border-slate-200/50 hover:bg-slate-50 text-slate-600'
            }`}
          >
            <Icon className="h-4.5 w-4.5" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
