/** Settings form state, persistence, and keyboard navigation. */
import { useEffect, useRef, useState } from 'react';
import type React from 'react';

import { Bell, Settings, Shield, User } from 'lucide-react';

import { useAuth } from '../../context/AuthContext';
import { getUser, saveUser } from '../../services/dataService';
import { fileToAvatarDataUrl } from '../../services/imageService';
import { initialsFor } from '../../services/profileService';

type ProfileRecord = {
  name?: string;
  email?: string;
  location?: string;
  preferences?: {
    units?: 'metric' | 'imperial';
    notificationsEnabled?: boolean;
    alertThreshold?: number;
  };
};

const tabs = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'preferences', label: 'Preferences', icon: Settings },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'privacy', label: 'Privacy & Security', icon: Shield },
] as const;

export type SettingsTabId = (typeof tabs)[number]['id'];

export function useSettings() {
  const { user, displayName, avatarUrl, syncProfileLocally, updateAvatar } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTabId>('profile');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [location, setLocation] = useState('');
  const [units, setUnits] = useState<'metric' | 'imperial'>('metric');
  const [notifications, setNotifications] = useState(true);
  const [threshold, setThreshold] = useState(100);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    getUser(user.uid)
      .then((profile) => {
        if (profile) {
          const p = profile as ProfileRecord;
          setName(p.name || displayName || '');
          setEmail(p.email || user.email || '');
          setLocation(p.location || '');
          const prefs = p.preferences;
          if (prefs) {
            setUnits(prefs.units || 'metric');
            setNotifications(prefs.notificationsEnabled !== false);
            setThreshold(prefs.alertThreshold || 100);
          }
        } else {
          setName(displayName || '');
          setEmail(user.email || '');
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [user, displayName]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const patch = {
        name,
        email,
        location,
        preferences: {
          units,
          notificationsEnabled: notifications,
          alertThreshold: threshold,
        },
        updatedAt: new Date().toISOString(),
      };
      await saveUser(user.uid, patch);
      syncProfileLocally(patch);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const flashSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoBusy(true);
    setError('');
    try {
      const dataUrl = await fileToAvatarDataUrl(file);
      await updateAvatar(dataUrl);
      flashSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleRemovePhoto = async () => {
    setPhotoBusy(true);
    setError('');
    try {
      await updateAvatar(null);
      flashSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const lastIndex = tabs.length - 1;
    let nextIndex: number;

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        nextIndex = index === lastIndex ? 0 : index + 1;
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        nextIndex = index === 0 ? lastIndex : index - 1;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = lastIndex;
        break;
      default:
        return;
    }

    event.preventDefault();
    setActiveTab(tabs[nextIndex]!.id as SettingsTabId);
    const tabButtons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    tabButtons?.[nextIndex]?.focus();
  };

  const initials = initialsFor(name || displayName || user?.email || 'U');

  return {
    user,
    displayName,
    avatarUrl,
    activeTab,
    setActiveTab,
    tabs,
    name,
    setName,
    email,
    location,
    setLocation,
    units,
    setUnits,
    notifications,
    setNotifications,
    threshold,
    setThreshold,
    saved,
    loading,
    error,
    loaded,
    photoBusy,
    fileInputRef,
    handleSave,
    handlePhotoChange,
    handleRemovePhoto,
    handleTabKeyDown,
    initials,
  };
}
