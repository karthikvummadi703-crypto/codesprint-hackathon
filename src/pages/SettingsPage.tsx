import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { NotificationsTab } from './settings/NotificationsTab';
import { PreferencesTab } from './settings/PreferencesTab';
import { PrivacyTab } from './settings/PrivacyTab';
import { ProfileTab } from './settings/ProfileTab';
import { SettingsErrorAlert } from './settings/SettingsErrorAlert';
import { SettingsHeader } from './settings/SettingsHeader';
import { SettingsTabs } from './settings/SettingsTabs';
import { useSettingsForm } from './settings/useSettingsForm';

export default function SettingsPage() {
  const controller = useSettingsForm();
  const { activeTab, setActiveTab, profile, save } = controller;

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      {/* Header */}
      <SettingsHeader saved={save.saved} />

      <div className="max-w-4xl mx-auto px-6 mt-8 flex flex-col md:flex-row gap-6">
        {/* Navigation Tabs */}
        <SettingsTabs activeTab={activeTab} onSelect={setActiveTab} />

        {/* Dynamic Settings Content */}
        <Card id="settings-panel" role="tabpanel" className="flex-1">
          <form onSubmit={save.handleSave}>
            {activeTab === 'profile' && <ProfileTab controller={controller} />}

            {activeTab === 'preferences' && (
              <PreferencesTab units={profile.units} onSelectUnits={profile.setUnits} />
            )}

            {activeTab === 'notifications' && (
              <NotificationsTab
                notifications={profile.notifications}
                onToggleNotifications={profile.setNotifications}
                threshold={profile.threshold}
                onThresholdChange={profile.setThreshold}
              />
            )}

            {activeTab === 'privacy' && <PrivacyTab />}

            {save.error && <SettingsErrorAlert error={save.error} />}

            <div className="border-t border-slate-100 mt-6 pt-5 flex justify-end">
              <Button type="submit" loading={save.loading} disabled={!profile.loaded}>
                Save Changes
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
