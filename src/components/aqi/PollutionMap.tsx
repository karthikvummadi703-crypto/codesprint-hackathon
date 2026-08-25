import React from 'react';
import { MapPin, AlertCircle, Info } from 'lucide-react';
import { LocationInfo } from '../../types';

interface PollutionMapProps {
  location: LocationInfo;
  aqi: number;
}

const ZONES = [
  { label: 'Gudur Town', x: 50, y: 50, aqi: 142, radius: 55, opacity: 0.18 },
  { label: 'Railway Station', x: 40, y: 65, aqi: 155, radius: 30, opacity: 0.14 },
  { label: 'Industrial Zone', x: 68, y: 40, aqi: 175, radius: 38, opacity: 0.2 },
  { label: 'Residential', x: 30, y: 38, aqi: 118, radius: 32, opacity: 0.1 },
  { label: 'Outskirts', x: 72, y: 68, aqi: 98, radius: 28, opacity: 0.08 },
];

function getZoneColor(aqi: number): string {
  if (aqi <= 50) return '#10B981';
  if (aqi <= 100) return '#F59E0B';
  if (aqi <= 150) return '#F97316';
  if (aqi <= 200) return '#EF4444';
  return '#8B5CF6';
}

export default function PollutionMap({ location, aqi }: PollutionMapProps) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
      {/* Map header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-brand-600" />
          <span className="text-sm font-semibold text-slate-800">{location.name}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-50 px-2 py-1 rounded-lg">
          <Info className="h-3 w-3" />
          Mock visualization
        </div>
      </div>

      {/* Map area */}
      <div className="relative h-64 bg-gradient-to-br from-brand-50 via-slate-50 to-emerald-50 overflow-hidden">
        {/* Grid lines */}
        <svg className="absolute inset-0 w-full h-full opacity-20" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
              <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#94A3B8" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        {/* Pollution zones */}
        <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
          {ZONES.map((zone) => (
            <circle
              key={zone.label}
              cx={`${zone.x}%`}
              cy={`${zone.y}%`}
              r={zone.radius}
              fill={getZoneColor(zone.aqi)}
              opacity={zone.opacity}
            />
          ))}
        </svg>

        {/* Zone labels */}
        {ZONES.slice(1).map((zone) => (
          <div
            key={zone.label}
            className="absolute text-[10px] font-medium text-slate-500 bg-white/70 rounded px-1 py-0.5"
            style={{ left: `${zone.x}%`, top: `${zone.y}%`, transform: 'translate(-50%,-50%)' }}
          >
            AQI {zone.aqi}
          </div>
        ))}

        {/* Main pin */}
        <div
          className="absolute flex flex-col items-center"
          style={{ left: '50%', top: '50%', transform: 'translate(-50%, -100%)' }}
        >
          <div className="bg-orange-500 text-white text-xs font-bold px-2 py-1 rounded-lg shadow-lg mb-1">
            AQI {aqi}
          </div>
          <MapPin className="h-7 w-7 text-orange-500 drop-shadow-md" fill="rgba(249,115,22,0.2)" />
        </div>

        {/* Roads mock */}
        <svg className="absolute inset-0 w-full h-full opacity-30" xmlns="http://www.w3.org/2000/svg">
          <line x1="0" y1="50%" x2="100%" y2="50%" stroke="#94A3B8" strokeWidth="1.5" strokeDasharray="4" />
          <line x1="50%" y1="0" x2="50%" y2="100%" stroke="#94A3B8" strokeWidth="1.5" strokeDasharray="4" />
          <line x1="10%" y1="20%" x2="80%" y2="75%" stroke="#94A3B8" strokeWidth="1" strokeDasharray="3" />
        </svg>
      </div>

      {/* Legend */}
      <div className="px-5 py-3 border-t border-slate-100">
        <div className="flex items-center gap-4 flex-wrap">
          {[
            { label: 'Good', color: '#10B981' },
            { label: 'Moderate', color: '#F59E0B' },
            { label: 'Unhealthy(SG)', color: '#F97316' },
            { label: 'Unhealthy', color: '#EF4444' },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-1.5 text-xs text-slate-600">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />
              {item.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
