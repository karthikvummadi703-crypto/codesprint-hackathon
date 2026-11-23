import { Badge } from '../../components/ui/Badge';
import { Check } from 'lucide-react';

export function SettingsHeader({ saved }: { saved: boolean }) {
  return (
    <div className="bg-white border-b border-slate-200 px-6 py-4">
      <div className="max-w-4xl mx-auto flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Settings</h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage your account credentials and app preferences
          </p>
        </div>
        {saved && (
          <Badge variant="success" className="h-7 text-xs gap-1 animate-fade-in">
            <Check className="h-3.5 w-3.5" /> Saved successfully
          </Badge>
        )}
      </div>
    </div>
  );
}
