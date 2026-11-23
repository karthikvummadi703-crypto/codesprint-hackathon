import { AlertCircle } from 'lucide-react';

export function SettingsErrorAlert({ error }: { error: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700"
    >
      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
      <span>{error}</span>
    </div>
  );
}
