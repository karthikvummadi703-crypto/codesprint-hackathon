/** Settings tab panels and save action. */
import { AlertCircle, Trash2, Upload } from 'lucide-react';

import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input, Label } from '../../components/ui/Input';
import type { useSettings } from './useSettings';

type Props = ReturnType<typeof useSettings>;

export default function SettingsPanelForm(settings: Props) {
  const {
    user,
    avatarUrl,
    activeTab,
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
    error,
    loading,
    loaded,
    photoBusy,
    fileInputRef,
    handleSave,
    handlePhotoChange,
    handleRemovePhoto,
    initials,
  } = settings;

  return (
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
                  This name is shown in the sidebar and greetings. Leave it blank and your sign-in email is
                  used instead.
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
  );
}
