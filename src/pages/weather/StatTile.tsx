import React from 'react';

/* ── Stat tile ───────────────────────────────────────────────────────── */
export default function StatTile({
  icon,
  label,
  value,
  sub,
  extra,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-bold text-slate-900 leading-tight">{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
      {extra}
    </div>
  );
}
