/**
 * Settings route for profile, avatar, password, and account actions.
 */
import { Check } from 'lucide-react';

import { Badge } from '../components/ui/Badge';
import SettingsPanelForm from './settings/SettingsPanelForm';
import SettingsTabs from './settings/SettingsTabs';
import { useSettings } from './settings/useSettings';

export default function SettingsPage() {
  const settings = useSettings();

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Settings</h1>
            <p className="text-xs text-slate-500 mt-1">Manage your account credentials and app preferences</p>
          </div>
          {settings.saved && (
            <Badge variant="success" className="h-7 text-xs gap-1 animate-fade-in">
              <Check className="h-3.5 w-3.5" /> Saved successfully
            </Badge>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 mt-8 flex flex-col md:flex-row gap-6">
        <SettingsTabs
          activeTab={settings.activeTab}
          setActiveTab={settings.setActiveTab}
          tabs={settings.tabs}
          handleTabKeyDown={settings.handleTabKeyDown}
        />
        <SettingsPanelForm {...settings} />
      </div>
    </div>
  );
}
