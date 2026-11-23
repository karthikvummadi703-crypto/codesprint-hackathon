import { useRef } from 'react';
import { Button } from '../../components/ui/Button';
import { Upload, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import type { SettingsFormController } from './useSettingsForm';

function PhotoActions({ controller }: { controller: SettingsFormController }) {
  const { avatarUrl } = useAuth();
  const { photo, profile } = controller;
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="mt-2 flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => fileInputRef.current?.click()}
        disabled={photo.photoBusy || !profile.loaded}
      >
        <Upload className="h-3.5 w-3.5" />
        {avatarUrl ? 'Change' : 'Upload'}
      </Button>
      {avatarUrl && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={photo.handleRemovePhoto}
          disabled={photo.photoBusy || !profile.loaded}
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
        onChange={photo.handlePhotoChange}
      />
    </div>
  );
}

export function ProfilePhotoSection({
  controller,
  initials,
}: {
  controller: SettingsFormController;
  initials: string;
}) {
  const { user, avatarUrl } = useAuth();

  return (
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
        <PhotoActions controller={controller} />
      </div>
    </div>
  );
}
