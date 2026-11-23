import { AlertCircle } from 'lucide-react';

export function BackendErrorNotice({ error }: { error: string }) {
  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 p-4 text-xs text-amber-800"
    >
      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
      <div>
        <p className="font-semibold">Backend unavailable — used local calculation instead.</p>
        <p className="mt-0.5">{error}</p>
      </div>
    </div>
  );
}
