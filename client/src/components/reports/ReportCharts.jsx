import {
  ResponsiveContainer, ComposedChart, BarChart, Bar, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell, PieChart, Pie, ReferenceLine,
} from 'recharts';
import { TOOLTIP_PROPS } from '../../charts/palette.js';
import { formatCurrency } from '../../utils/format.js';

// Report charts use fixed hex colours (not CSS variables) so the same SVG can be captured as a PNG
// for the Excel workbook. Axis text uses a mid grey that reads in both light and dark themes.
export const COLORS = {
  revenue: '#C29A56', expenses: '#454856', purchases: '#7E90B0', netProfit: '#3F8F6D', grossProfit: '#8AA6A3', growth: '#B0725B', grid: '#8C8F99',
};
export const SERIES_PALETTE = ['#C29A56', '#454856', '#8AA6A3', '#B0725B', '#7E90B0', '#A98CC4', '#6FA687', '#C2745E', '#D4B98A', '#5E7A8C'];
const AXIS = { fontSize: 11, fill: '#8C8F99' };

export const compact = (v) => {
  const a = Math.abs(v); const s = v < 0 ? '-' : '';
  if (a >= 1e7) return `${s}${(a / 1e7).toFixed(1)}Cr`;
  if (a >= 1e5) return `${s}${(a / 1e5).toFixed(1)}L`;
  if (a >= 1e3) return `${s}${Math.round(a / 1e3)}k`;
  return `${s}${Math.round(a)}`;
};
const money = (v) => (v === null || v === undefined ? '—' : formatCurrency(v));

export function RevenueExpenseChart({ data, showProfit, showPurchases }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={COLORS.grid} strokeOpacity={0.18} strokeDasharray="3 6" vertical={false} />
        <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} minTickGap={14} dy={6} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={compact} width={54} />
        <Tooltip {...TOOLTIP_PROPS} formatter={(v, n) => [money(v), n]} />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 6 }} iconType="circle" iconSize={8} />
        <ReferenceLine y={0} stroke={COLORS.grid} strokeOpacity={0.4} />
        <Bar dataKey="revenue" name="Revenue" fill={COLORS.revenue} radius={[5, 5, 0, 0]} maxBarSize={28} />
        <Bar dataKey="expenses" name="Expenses" fill={COLORS.expenses} radius={[5, 5, 0, 0]} maxBarSize={28} />
        {showPurchases && <Line type="monotone" dataKey="purchases" name="Purchases" stroke={COLORS.purchases} strokeWidth={2} strokeDasharray="5 4" dot={false} />}
        {showProfit && <Line type="monotone" dataKey="netProfit" name="Net profit" stroke={COLORS.netProfit} strokeWidth={2.5} dot={{ r: 2.5 }} activeDot={{ r: 5 }} />}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function ProfitTrendChart({ data, profitKey = 'netProfit' }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="rpProfitFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLORS.netProfit} stopOpacity={0.35} />
            <stop offset="100%" stopColor={COLORS.netProfit} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={COLORS.grid} strokeOpacity={0.18} strokeDasharray="3 6" vertical={false} />
        <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} minTickGap={14} dy={6} />
        <YAxis yAxisId="v" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={compact} width={54} />
        {/* Growth is capped at ±200% on the axis so one swing from a near-zero base doesn't flatten the chart. */}
        <YAxis yAxisId="g" orientation="right" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} width={44} domain={[-200, 200]} allowDataOverflow />
        <Tooltip {...TOOLTIP_PROPS} formatter={(v, n) => (n === 'Profit growth' ? [v === null ? '—' : `${v}%`, n] : [money(v), n])} />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 6 }} iconType="circle" iconSize={8} />
        <ReferenceLine yAxisId="v" y={0} stroke={COLORS.grid} strokeOpacity={0.4} />
        <Area yAxisId="v" type="monotone" dataKey="grossProfit" name="Gross profit" stroke={COLORS.grossProfit} fill="none" strokeWidth={2} />
        {profitKey === 'netProfit' && <Area yAxisId="v" type="monotone" dataKey="netProfit" name="Net profit" stroke={COLORS.netProfit} fill="url(#rpProfitFill)" strokeWidth={2.5} />}
        <Bar yAxisId="g" dataKey="profitGrowth" name="Profit growth" maxBarSize={10} radius={[3, 3, 0, 0]}>
          {data.map((d, i) => <Cell key={i} fill={(d.profitGrowth ?? 0) >= 0 ? '#9CC7B2' : '#E2A49B'} />)}
        </Bar>
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function RankBarChart({ data, valueKey = 'revenue', labelKey = 'name', color = COLORS.revenue }) {
  const rows = data.map((d) => ({ ...d, short: String(d[labelKey]).length > 26 ? `${String(d[labelKey]).slice(0, 25)}…` : d[labelKey] }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={COLORS.grid} strokeOpacity={0.15} horizontal={false} />
        <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={compact} />
        <YAxis type="category" dataKey="short" tick={{ ...AXIS, fontSize: 11 }} axisLine={false} tickLine={false} width={170} />
        <Tooltip {...TOOLTIP_PROPS} formatter={(v) => money(v)} labelFormatter={(_, p) => p?.[0]?.payload?.[labelKey] ?? ''} />
        <Bar dataKey={valueKey} name="Revenue" fill={color} radius={[0, 6, 6, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ShareDonut({ data, valueKey = 'revenue', labelKey = 'name' }) {
  const total = data.reduce((t, d) => t + (d[valueKey] || 0), 0);
  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="w-full flex-1 min-h-[140px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey={valueKey} nameKey={labelKey} innerRadius="58%" outerRadius="86%" paddingAngle={2} cornerRadius={5} stroke="none">
              {data.map((_, i) => <Cell key={i} fill={SERIES_PALETTE[i % SERIES_PALETTE.length]} />)}
            </Pie>
            <Tooltip {...TOOLTIP_PROPS} formatter={(v, n) => [money(v), String(n).replace(/_/g, ' ')]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="w-full grid grid-cols-2 gap-x-4 gap-y-1 text-xs max-h-[45%] overflow-y-auto pr-1">
        {data.map((d, i) => (
          <li key={d[labelKey]} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: SERIES_PALETTE[i % SERIES_PALETTE.length] }} />
            <span className="truncate capitalize flex-1" style={{ color: 'var(--text-secondary)' }}>{String(d[labelKey]).replace(/_/g, ' ')}</span>
            <span className="font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{total ? `${((d[valueKey] / total) * 100).toFixed(1)}%` : '—'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
