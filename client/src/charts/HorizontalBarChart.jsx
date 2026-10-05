import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { GRID, AXIS_TEXT, TOOLTIP_PROPS } from './palette.js';
import { formatCurrency } from '../utils/format.js';

export function HorizontalBarChart({ data, dataKey = 'revenue', labelKey = 'productName' }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="barGold" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#A67F42" />
            <stop offset="60%" stopColor="#C29A56" />
            <stop offset="100%" stopColor="#E9CF9A" />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} strokeDasharray="3 6" horizontal={false} strokeOpacity={0.7} />
        <XAxis type="number" tick={{ fontSize: 11, fill: AXIS_TEXT }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
        <YAxis type="category" dataKey={labelKey} width={150} tick={{ fontSize: 11, fill: AXIS_TEXT }} axisLine={false} tickLine={false} />
        <Tooltip {...TOOLTIP_PROPS} formatter={(v) => formatCurrency(v)} />
        <Bar dataKey={dataKey} name="Revenue" radius={[0, 10, 10, 0]} barSize={14} background={{ fill: 'rgba(194,154,86,0.06)', radius: 10 }} animationDuration={1200} animationEasing="ease-out">
          {data?.map((_, i) => <Cell key={i} fill="url(#barGold)" fillOpacity={1 - i * 0.13} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default HorizontalBarChart;
