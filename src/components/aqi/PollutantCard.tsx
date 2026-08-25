import React from 'react';
import { PollutantDetail } from '../../types';
import { getAQIBadgeVariant, Badge } from '../ui/Badge';
import { cn } from '../ui/Button';

interface PollutantCardProps {
  pollutant: PollutantDetail;
}

function getPollutantBarColor(id: string): string {
  const colors: Record<string, string> = {
    pm25: 'bg-orange-400',
    pm10: 'bg-amber-400',
    no2: 'bg-blue-400',
    so2: 'bg-yellow-400',
    co: 'bg-red-400',
    o3: 'bg-teal-400',
  };
  return colors[id] ?? 'bg-slate-400';
}

export default function PollutantCard({ pollutant }: PollutantCardProps) {
  const pct = Math.min((pollutant.value / pollutant.safeLimit) * 100, 100);
  const isOver = pollutant.value > pollutant.safeLimit;

  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-5 hover:shadow-md transition-shadow duration-200">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
            {pollutant.name}
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {pollutant.value}
            <span className="text-sm font-normal text-slate-500 ml-1">{pollutant.unit}</span>
          </div>
        </div>
        <Badge variant={getAQIBadgeVariant(pollutant.status)} className="text-[10px]">
          {pollutant.status === 'Good' ? 'Good' : 'High'}
        </Badge>
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="flex justify-between text-[11px] text-slate-400 mb-1">
          <span>0</span>
          <span>Safe limit: {pollutant.safeLimit} {pollutant.unit}</span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              isOver ? 'bg-orange-400' : getPollutantBarColor(pollutant.id)
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <p className="text-[11px] text-slate-500 leading-relaxed">{pollutant.description}</p>
    </div>
  );
}
