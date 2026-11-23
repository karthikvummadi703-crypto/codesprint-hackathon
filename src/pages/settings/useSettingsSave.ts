import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { saveUser } from '../../services/dataService';
import type { SettingsProfileController } from './useSettingsProfile';

export function useSettingsSave(profile: SettingsProfileController) {
  const { user, syncProfileLocally } = useAuth();
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const flashSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const patch = {
        name: profile.name,
        email: profile.email,
        location: profile.location,
        preferences: {
          units: profile.units,
          notificationsEnabled: profile.notifications,
          alertThreshold: profile.threshold,
        },
        updatedAt: new Date().toISOString(),
      };
      await saveUser(user.uid, patch);
      // refresh the shared profile in memory; saveUser already persisted it.
      syncProfileLocally(patch);
      flashSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return { saved, loading, error, setError, flashSaved, handleSave };
}

export type SettingsSaveController = ReturnType<typeof useSettingsSave>;
