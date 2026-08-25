import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { HistoricalDataPoint } from '../../types';

interface AQITrendChartProps {
  data: HistoricalDataPoint[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const aqi = payload[0].value;
    return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-4 py-3">
        <div className="text-xs text-slate-500 mb-1">{label}</div>
        <div className="text-lg font-bold text-slate-900">{aqi} AQI</div>
      </div>
    );
  }
  return null;
};

export default function AQITrendChart({ data }: AQITrendChartProps) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">24-Hour AQI Trend</h3>
          <p className="text-xs text-slate-400 mt-0.5">Hourly air quality index readings</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="h-2 w-2 rounded-full bg-orange-400 inline-block" />
          AQI Level
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
          <defs>
            <linearGradient id="aqiGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#F97316" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#F97316" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 11, fill: '#94A3B8' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#94A3B8' }}
            tickLine={false}
            axisLine={false}
            domain={[80, 180]}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={150} stroke="#EF4444" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: 'Unhealthy', fill: '#EF4444', fontSize: 10, position: 'insideTopRight' }} />
          <ReferenceLine y={100} stroke="#F59E0B" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: 'Moderate', fill: '#F59E0B', fontSize: 10, position: 'insideTopRight' }} />
          <Area
            type="monotone"
            dataKey="aqi"
            stroke="#F97316"
            strokeWidth={2.5}
            fill="url(#aqiGradient)"
            dot={false}
            activeDot={{ r: 5, fill: '#F97316', stroke: '#fff', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
