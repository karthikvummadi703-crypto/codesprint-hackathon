import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Label } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { User, Settings, Bell, Shield, Check, AlertCircle, Upload, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getUser, saveUser } from '../services/dataService';
import { initialsFor } from '../services/profileService';
import { fileToAvatarDataUrl } from '../services/imageService';

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

export default function SettingsPage() {
  const { user, displayName, avatarUrl, syncProfileLocally, updateAvatar } = useAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'preferences' | 'notifications' | 'privacy'>(
    'profile',
  );
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
      // refresh the shared profile in memory; saveUser already persisted it.
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
    // Clear the input so re-selecting the same file still fires a change event.
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

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'preferences', label: 'Preferences', icon: Settings },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'privacy', label: 'Privacy & Security', icon: Shield },
  ] as const;

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
    setActiveTab(tabs[nextIndex].id as typeof activeTab);
    const tabButtons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    tabButtons?.[nextIndex]?.focus();
  };

  const initials = initialsFor(name || displayName || user?.email || 'U');

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Settings</h1>
            <p className="text-xs text-slate-500 mt-1">Manage your account credentials and app preferences</p>
          </div>
          {saved && (
            <Badge variant="success" className="h-7 text-xs gap-1 animate-fade-in">
              <Check className="h-3.5 w-3.5" /> Saved successfully
            </Badge>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 mt-8 flex flex-col md:flex-row gap-6">
        {/* Navigation Tabs */}
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

        {/* Dynamic Settings Content */}
        <Card
          id="settings-panel"
          role="tabpanel"
          aria-labelledby={`settings-tab-${activeTab}`}
          className="flex-1"
        >
          <form onSubmit={handleSave} aria-describedby={error ? 'settings-error' : undefined}>
            {activeTab === 'profile' && (
              <div className="space-y-6">
                <CardHeader className="px-0 pt-0 pb-5">
                  <CardTitle>Profile Details</CardTitle>
                </CardHeader>
                <CardContent className="px-0 py-0 space-y-4">
                  <div className="flex items-center gap-4 py-2">
                    <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-2xl font-bold overflow-hidden shrink-0">
                      {avatarUrl ? (
                        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        initials
                      )}
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-800">Profile Photo</h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {user?.isDev
                          ? 'Stored in this browser while in dev mode.'
                          : 'Saved to your profile and shown across the app.'}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={photoBusy || !loaded}
                        >
                          <Upload className="h-3.5 w-3.5" />
                          {avatarUrl ? 'Change' : 'Upload'}
                        </Button>
                        {avatarUrl && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={handleRemovePhoto}
                            disabled={photoBusy || !loaded}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Remove
                          </Button>
                        )}
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          className="sr-only"
                          aria-label="Upload profile photo"
                          onChange={handlePhotoChange}
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="name">Full Name</Label>
                    <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
                    <p className="mt-1.5 text-[11px] text-slate-400 leading-relaxed">
                      This name is shown in the sidebar and greetings. Leave it blank and your sign-in email
                      is used instead.
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="email">Email Address</Label>
                    <Input id="email" type="email" value={email} readOnly aria-readonly="true" />
                    <p className="mt-1.5 text-[11px] text-slate-400 leading-relaxed">
                      Managed by your sign-in provider and shown here for reference.
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="location">Default Location</Label>
                    <Input
                      id="location"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      required
                    />
                  </div>
                </CardContent>
              </div>
            )}

            {activeTab === 'preferences' && (
              <div className="space-y-6">
                <CardHeader className="px-0 pt-0 pb-5">
                  <CardTitle>Application Preferences</CardTitle>
                </CardHeader>
                <CardContent className="px-0 py-0 space-y-4">
                  <div>
                    <span id="units-label" className="block text-sm font-medium text-slate-700 mb-1.5">
                      Measurement Units
                    </span>
                    <div role="group" aria-labelledby="units-label" className="flex gap-3">
                      <button
                        type="button"
                        aria-pressed={units === 'metric'}
                        onClick={() => setUnits('metric')}
                        className={`flex-1 py-3 rounded-xl border text-sm font-semibold transition-all ${
                          units === 'metric'
                            ? 'border-brand-600 bg-brand-50 text-brand-800'
                            : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
                        }`}
                      >
                        Metric (µg/m³, mg/m³)
                      </button>
                      <button
                        type="button"
                        aria-pressed={units === 'imperial'}
                        onClick={() => setUnits('imperial')}
                        className={`flex-1 py-3 rounded-xl border text-sm font-semibold transition-all ${
                          units === 'imperial'
                            ? 'border-brand-600 bg-brand-50 text-brand-800'
                            : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
                        }`}
                      >
                        Imperial (ppm, ppb)
                      </button>
                    </div>
                  </div>
                </CardContent>
              </div>
            )}

            {activeTab === 'notifications' && (
              <div className="space-y-6">
                <CardHeader className="px-0 pt-0 pb-5">
                  <CardTitle>Notification Trigger Levels</CardTitle>
                </CardHeader>
                <CardContent className="px-0 py-0 space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 id="alert-notifications-label" className="text-sm font-semibold text-slate-800">
                        Alert Notifications
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Receive immediate warnings when air pollution spikes
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={notifications}
                      aria-labelledby="alert-notifications-label"
                      onClick={() => setNotifications(!notifications)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 ${
                        notifications ? 'bg-brand-600' : 'bg-slate-200'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          notifications ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {notifications && (
                    <div className="space-y-3 pt-3 border-t border-slate-100">
                      <Label htmlFor="threshold">Alert Threshold (AQI)</Label>
                      <div className="flex items-center gap-4">
                        <input
                          id="threshold"
                          type="range"
                          min="50"
                          max="300"
                          step="10"
                          value={threshold}
                          aria-valuetext={`${threshold} AQI`}
                          onChange={(e) => setThreshold(parseInt(e.target.value))}
                          className="flex-1 accent-brand-600 h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer"
                        />
                        <Badge variant="warning" className="h-8 px-3 shrink-0 text-sm">
                          {threshold} AQI
                        </Badge>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-relaxed mt-1">
                        Notifications will fire whenever local readings exceed {threshold} AQI
                        (Moderate/Unhealthy).
                      </p>
                    </div>
                  )}
                </CardContent>
              </div>
            )}

            {activeTab === 'privacy' && (
              <div className="space-y-6">
                <CardHeader className="px-0 pt-0 pb-5">
                  <CardTitle>Privacy Settings</CardTitle>
                </CardHeader>
                <CardContent className="px-0 py-0 space-y-4">
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-slate-800">Data & Access</h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Your data (air quality history, chats, uploaded documents, carbon trips) is stored under
                      your account only.{' '}
                      {user?.isDev
                        ? 'You are currently in dev mode, so data is stored locally in this browser.'
                        : 'Data is stored in your private Firestore collections.'}
                    </p>
                  </div>
                </CardContent>
              </div>
            )}

            {error && (
              <div
                id="settings-error"
                role="alert"
                className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700"
              >
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            <div className="border-t border-slate-100 mt-6 pt-5 flex justify-end">
              <Button
                type="submit"
                loading={loading}
                disabled={!loaded}
                aria-describedby={error ? 'settings-error' : undefined}
              >
                Save Changes
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
