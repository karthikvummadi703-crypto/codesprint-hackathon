import { Cloud, Droplets, Sun } from 'lucide-react';

/* ── weather condition icon ──────────────────────────────────────────── */
export default function ConditionIcon({ code, size = 'h-6 w-6' }: { code: number; size?: string }) {
  if (code === 0) return <Sun className={`${size} text-yellow-400`} />;
  if (code <= 2) return <Cloud className={`${size} text-slate-300`} />;
  if (code <= 49) return <Cloud className={`${size} text-slate-400`} />;
  if (code <= 67) return <Droplets className={`${size} text-blue-400`} />;
  if (code <= 82) return <Droplets className={`${size} text-blue-600`} />;
  return <Cloud className={`${size} text-slate-600`} />;
}
