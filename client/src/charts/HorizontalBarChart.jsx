import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { BRAND, GRID, AXIS_TEXT, TOOLTIP_PROPS } from './palette.js';
import { formatCurrency } from '../utils/format.js';

export function HorizontalBarChart({ data, dataKey = 'revenue', labelKey = 'productName' }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 6" horizontal={false} strokeOpacity={0.7} />
        <XAxis type="number" tick={{ fontSize: 11, fill: AXIS_TEXT }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
        <YAxis type="category" dataKey={labelKey} width={150} tick={{ fontSize: 11, fill: AXIS_TEXT }} axisLine={false} tickLine={false} />
        <Tooltip {...TOOLTIP_PROPS} formatter={(v) => formatCurrency(v)} />
        <Bar dataKey={dataKey} name="Revenue" radius={[0, 4, 4, 0]} barSize={14} background={{ fill: 'var(--brand-tint)', radius: 4 }} animationDuration={1200} animationEasing="ease-out">
          {data?.map((_, i) => <Cell key={i} fill={BRAND} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default HorizontalBarChart;
