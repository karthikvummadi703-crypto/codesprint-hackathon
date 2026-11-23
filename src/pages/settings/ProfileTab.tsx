import { CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input, Label } from '../../components/ui/Input';
import { useAuth } from '../../context/AuthContext';
import { initialsFor } from '../../services/profileService';
import { ProfilePhotoSection } from './ProfilePhotoSection';
import type { SettingsFormController } from './useSettingsForm';

export function ProfileTab({ controller }: { controller: SettingsFormController }) {
  const { user, displayName } = useAuth();
  const { profile } = controller;
  const initials = initialsFor(profile.name || displayName || user?.email || 'U');

  return (
    <div className="space-y-6">
      <CardHeader className="px-0 pt-0 pb-5">
        <CardTitle>Profile Details</CardTitle>
      </CardHeader>
      <CardContent className="px-0 py-0 space-y-4">
        <ProfilePhotoSection controller={controller} initials={initials} />

        <div>
          <Label htmlFor="name">Full Name</Label>
          <Input
            id="name"
            value={profile.name}
            onChange={e => profile.setName(e.target.value)}
            required
          />
          <p className="mt-1.5 text-[11px] text-slate-400 leading-relaxed">
            This name is shown in the sidebar and greetings. Leave it blank and your sign-in email
            is used instead.
          </p>
        </div>

        <div>
          <Label htmlFor="email">Email Address</Label>
          <Input id="email" type="email" value={profile.email} readOnly aria-readonly="true" />
          <p className="mt-1.5 text-[11px] text-slate-400 leading-relaxed">
            Managed by your sign-in provider and shown here for reference.
          </p>
        </div>

        <div>
          <Label htmlFor="location">Default Location</Label>
          <Input
            id="location"
            value={profile.location}
            onChange={e => profile.setLocation(e.target.value)}
            required
          />
        </div>
      </CardContent>
    </div>
  );
}
