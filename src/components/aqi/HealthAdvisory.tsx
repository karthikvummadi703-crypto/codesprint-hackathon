import React from 'react';
import { AlertTriangle, CheckCircle, Info, Shield } from 'lucide-react';
import { AQIStatus } from '../../types';

interface HealthAdvisoryProps {
  status: AQIStatus;
  advisory: string;
  aqi: number;
}

const advisoryConfig: Record<AQIStatus, { bg: string; border: string; icon: React.ElementType; iconColor: string; title: string }> = {
  Good: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    icon: CheckCircle,
    iconColor: 'text-emerald-500',
    title: 'Air Quality is Good',
  },
  Moderate: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    icon: Info,
    iconColor: 'text-amber-500',
    title: 'Moderate Air Quality',
  },
  'Unhealthy for Sensitive Groups': {
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    icon: Shield,
    iconColor: 'text-orange-500',
    title: 'Caution for Sensitive Groups',
  },
  Unhealthy: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    icon: AlertTriangle,
    iconColor: 'text-red-500',
    title: 'Unhealthy Air Quality',
  },
  'Very Unhealthy': {
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    icon: AlertTriangle,
    iconColor: 'text-purple-500',
    title: 'Very Unhealthy — Avoid Outdoors',
  },
  Hazardous: {
    bg: 'bg-red-100',
    border: 'border-red-400',
    icon: AlertTriangle,
    iconColor: 'text-red-700',
    title: 'Hazardous — Stay Indoors',
  },
};

export default function HealthAdvisory({ status, advisory, aqi }: HealthAdvisoryProps) {
  const config = advisoryConfig[status];
  const Icon = config.icon;

  const tips = [
    aqi > 100 ? 'Wear an N95 mask outdoors' : 'Air quality is safe for outdoor activities',
    aqi > 150 ? 'Keep windows closed' : 'Good time for outdoor exercise',
    aqi > 100 ? 'Use air purifiers indoors' : 'Enjoy fresh air',
    aqi > 200 ? 'Postpone outdoor events' : 'Normal precautions apply',
  ].slice(0, aqi > 100 ? 3 : 2);

  return (
    <div className={`rounded-2xl border ${config.bg} ${config.border} p-5`}>
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2 rounded-xl bg-white shadow-sm`}>
          <Icon className={`h-5 w-5 ${config.iconColor}`} />
        </div>
        <div>
          <div className="text-sm font-semibold text-slate-800">{config.title}</div>
          <div className="text-xs text-slate-500">AQI {aqi} • {status}</div>
        </div>
      </div>
      <p className="text-sm text-slate-700 leading-relaxed mb-3">{advisory}</p>
      <ul className="space-y-1.5">
        {tips.map((tip, i) => (
          <li key={i} className="flex items-center gap-2 text-xs text-slate-600">
            <span className="h-1.5 w-1.5 rounded-full bg-current flex-shrink-0" />
            {tip}
          </li>
        ))}
      </ul>
    </div>
  );
}
