import React, { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { HistoricalDataPoint } from '../../types';

interface PollutantTrendChartProps {
  data: HistoricalDataPoint[];
}

const POLLUTANT_CONFIG = [
  { key: 'pm25', label: 'PM2.5', color: '#F97316' },
  { key: 'pm10', label: 'PM10', color: '#F59E0B' },
  { key: 'no2', label: 'NO₂', color: '#3B82F6' },
  { key: 'o3', label: 'O₃', color: '#10B981' },
];

export default function PollutantTrendChart({ data }: PollutantTrendChartProps) {
  const [active, setActive] = useState<string[]>(['pm25', 'pm10']);

  const toggle = (key: string) => {
    setActive((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Pollutant Trend</h3>
          <p className="text-xs text-slate-400 mt-0.5">24-hour individual pollutant levels</p>
        </div>
      </div>

      {/* Toggle pills */}
      <div className="flex flex-wrap gap-2 mb-5">
        {POLLUTANT_CONFIG.map((p) => (
          <button
            key={p.key}
            onClick={() => toggle(p.key)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all ${
              active.includes(p.key)
                ? 'text-white shadow-sm'
                : 'bg-slate-100 text-slate-500'
            }`}
            style={active.includes(p.key) ? { backgroundColor: p.color } : {}}
          >
            {p.label}
          </button>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
          <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 12, border: '1px solid #E2E8F0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
          />
          {POLLUTANT_CONFIG.filter((p) => active.includes(p.key)).map((p) => (
            <Line
              key={p.key}
              type="monotone"
              dataKey={p.key}
              stroke={p.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: p.color, stroke: '#fff', strokeWidth: 2 }}
              name={p.label}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
