import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { GOLD, GRID, AXIS_TEXT } from './palette.js';
import { formatCurrency } from '../utils/format.js';

export function HorizontalBarChart({ data, dataKey = 'revenue', labelKey = 'productName' }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: AXIS_TEXT }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
        <YAxis type="category" dataKey={labelKey} width={140} tick={{ fontSize: 11, fill: AXIS_TEXT }} axisLine={false} tickLine={false} />
        <Tooltip formatter={(v) => formatCurrency(v)} contentStyle={{ borderRadius: 10, border: '1px solid #E7E3D8', fontSize: 12 }} />
        <Bar dataKey={dataKey} radius={[0, 6, 6, 0]} barSize={16}>
          {data?.map((_, i) => <Cell key={i} fill={GOLD} fillOpacity={1 - i * 0.12} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default HorizontalBarChart;
