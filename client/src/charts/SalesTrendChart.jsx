import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { BRAND, NEUTRAL, GRID, AXIS_TEXT, TOOLTIP_PROPS } from './palette.js';
import { formatCurrency } from '../utils/format.js';

const shortDate = (v) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) || String(v).length < 8 ? v : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

export function SalesTrendChart({ data, showPurchases = true }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={BRAND} stopOpacity={0.32} />
            <stop offset="70%" stopColor={BRAND} stopOpacity={0.05} />
            <stop offset="100%" stopColor={BRAND} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="salesStroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--viz-1)" />
            <stop offset="100%" stopColor="var(--viz-1)" />
          </linearGradient>
          <linearGradient id="purchaseFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={NEUTRAL} stopOpacity={0.16} />
            <stop offset="100%" stopColor={NEUTRAL} stopOpacity={0} />
          </linearGradient>
          <filter id="salesGlow" x="-10%" y="-30%" width="120%" height="160%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <CartesianGrid stroke={GRID} strokeDasharray="3 6" vertical={false} strokeOpacity={0.7} />
        <XAxis dataKey="period" tickFormatter={shortDate} tick={{ fontSize: 11, fill: AXIS_TEXT }} axisLine={false} tickLine={false} dy={8} minTickGap={16} />
        <YAxis tick={{ fontSize: 11, fill: AXIS_TEXT }} axisLine={false} tickLine={false} tickFormatter={(v) => (v >= 100000 ? `${(v / 100000).toFixed(1)}L` : `${Math.round(v / 1000)}k`)} width={52} />
        <Tooltip {...TOOLTIP_PROPS} formatter={(v) => formatCurrency(v)} labelFormatter={shortDate} />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="circle" iconSize={8} />
        <Area
          type="monotone" dataKey="sales" name="Sales" stroke="url(#salesStroke)" strokeWidth={2} fill="url(#salesFill)"
          filter="url(#salesGlow)" activeDot={{ r: 5, fill: BRAND, stroke: 'var(--bg-surface)', strokeWidth: 2 }}
          animationDuration={1400} animationEasing="ease-out"
        />
        {showPurchases && (
          <Area
            type="monotone" dataKey="purchases" name="Purchases" stroke={NEUTRAL} strokeWidth={2} strokeDasharray="5 4" fill="url(#purchaseFill)"
            activeDot={{ r: 4, fill: NEUTRAL, stroke: 'var(--bg-surface)', strokeWidth: 2 }} animationDuration={1600} animationEasing="ease-out"
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export default SalesTrendChart;
