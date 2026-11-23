import { useState } from 'react';
import type { SettingsTab } from './types';
import { useProfilePhoto } from './useProfilePhoto';
import { useSettingsProfile } from './useSettingsProfile';
import { useSettingsSave } from './useSettingsSave';

export function useSettingsForm() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const profile = useSettingsProfile();
  const save = useSettingsSave(profile);
  const photo = useProfilePhoto({ setError: save.setError, flashSaved: save.flashSaved });

  return { activeTab, setActiveTab, profile, save, photo };
}

export type SettingsFormController = ReturnType<typeof useSettingsForm>;
