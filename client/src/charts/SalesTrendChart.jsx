import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { GOLD, GRAPHITE, GRID, AXIS_TEXT } from './palette.js';
import { formatCurrency } from '../utils/format.js';

export function SalesTrendChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={GOLD} stopOpacity={0.35} />
            <stop offset="100%" stopColor={GOLD} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="purchaseFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={GRAPHITE} stopOpacity={0.25} />
            <stop offset="100%" stopColor={GRAPHITE} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="period" tick={{ fontSize: 11, fill: AXIS_TEXT }} axisLine={{ stroke: GRID }} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: AXIS_TEXT }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
        <Tooltip formatter={(v) => formatCurrency(v)} contentStyle={{ borderRadius: 10, border: '1px solid #E7E3D8', fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Area type="monotone" dataKey="sales" name="Sales" stroke={GOLD} strokeWidth={2} fill="url(#salesFill)" />
        <Area type="monotone" dataKey="purchases" name="Purchases" stroke={GRAPHITE} strokeWidth={2} fill="url(#purchaseFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export default SalesTrendChart;
