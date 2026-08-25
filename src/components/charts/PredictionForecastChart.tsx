import React from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { PredictionForecast } from '../../types';
import { getAQIColor } from '../ui/Badge';

interface PredictionForecastChartProps {
  forecasts: PredictionForecast[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0]?.payload as PredictionForecast;
    return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-4 min-w-40">
        <div className="text-xs font-semibold text-slate-500 mb-2">{data.label}</div>
        <div className="text-2xl font-bold mb-1" style={{ color: getAQIColor(data.aqi) }}>
          {data.aqi}
        </div>
        <div className="text-xs text-slate-400">{data.status}</div>
        <div className="text-xs text-brand-600 mt-1.5">
          {data.timeOffsetHours > 0 ? `${data.confidence}% confidence` : 'Current reading'}
        </div>
      </div>
    );
  }
  return null;
};

export default function PredictionForecastChart({ forecasts }: PredictionForecastChartProps) {
  const chartData = forecasts.map((f) => ({
    ...f,
    fill: getAQIColor(f.aqi),
  }));

  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">AQI Forecast</h3>
          <p className="text-xs text-slate-400 mt-0.5">Predicted air quality over the next 24 hours</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <span className="h-2 w-4 bg-orange-300 rounded inline-block" /> Predicted
          </span>
          <span className="flex items-center gap-1">
            <span className="h-0.5 w-4 bg-brand-500 rounded inline-block" /> Trend
          </span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={chartData} margin={{ top: 10, right: 5, left: -20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={false} domain={[100, 200]} />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={150} stroke="#EF4444" strokeDasharray="4 4" strokeWidth={1.5} />
          <Bar dataKey="aqi" radius={[8, 8, 0, 0]} fill="#FED7AA" maxBarSize={60} />
          <Line
            type="monotone"
            dataKey="aqi"
            stroke="#16A34A"
            strokeWidth={2}
            dot={{ r: 4, fill: '#16A34A', stroke: '#fff', strokeWidth: 2 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
