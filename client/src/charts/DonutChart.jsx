import { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Sector } from 'recharts';
import { CATEGORICAL, NEUTRAL, TOOLTIP_PROPS } from './palette.js';
import { formatCurrency } from '../utils/format.js';

const titleCase = (s) => String(s ?? '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
// The palette has eight validated slots; beyond that the smallest slices are grouped as "Other"
// rather than repeating a colour (the detail page lists every slice).
const MAX_SLICES = CATEGORICAL.length;

// Hovered slice expands outward with a soft outer ring.
function ActiveSlice(props) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
  return (
    <g>
      <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 5} startAngle={startAngle} endAngle={endAngle} fill={fill} cornerRadius={4} />
      <Sector cx={cx} cy={cy} innerRadius={outerRadius + 8} outerRadius={outerRadius + 10} startAngle={startAngle} endAngle={endAngle} fill={fill} opacity={0.35} />
    </g>
  );
}

export function DonutChart({ data, nameKey = '_id', valueKey = 'value' }) {
  const [active, setActive] = useState(-1);

  const slices = useMemo(() => {
    const rows = (data || []).map((d) => ({ name: d[nameKey], value: Number(d[valueKey]) || 0 }));
    if (rows.length <= MAX_SLICES) return rows.map((r, i) => ({ ...r, color: CATEGORICAL[i] }));
    const sorted = [...rows].sort((a, b) => b.value - a.value);
    const head = sorted.slice(0, MAX_SLICES - 1).map((r, i) => ({ ...r, color: CATEGORICAL[i] }));
    const rest = sorted.slice(MAX_SLICES - 1);
    return [...head, { name: `Other (${rest.length})`, value: rest.reduce((s, r) => s + r.value, 0), color: NEUTRAL }];
  }, [data, nameKey, valueKey]);

  if (!slices.length) return null;
  const total = slices.reduce((s, d) => s + d.value, 0);
  const shown = active >= 0 ? slices[active] : null;
  const pct = (v) => (total > 0 ? `${((v / total) * 100).toFixed(1)}%` : '—');

  return (
    <div className="w-full h-full flex items-center gap-4">
      <div className="relative h-full flex-1 min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="86%" paddingAngle={2} cornerRadius={4}
              stroke="none" activeIndex={active} activeShape={ActiveSlice}
              onMouseEnter={(_, i) => setActive(i)} onMouseLeave={() => setActive(-1)}
              animationDuration={1200} animationEasing="ease-out"
            >
              {slices.map((s, i) => <Cell key={i} fill={s.color} />)}
            </Pie>
            <Tooltip {...TOOLTIP_PROPS} formatter={(v, n) => [formatCurrency(v), titleCase(n)]} />
          </PieChart>
        </ResponsiveContainer>
        {/* Centre readout: total, or the hovered slice. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center px-6">
          <div className="text-[11px] font-medium truncate max-w-full" style={{ color: 'var(--text-muted)' }}>{shown ? titleCase(shown.name) : 'Total'}</div>
          <div className="font-display text-base font-bold" style={{ color: 'var(--text-primary)' }}>
            {formatCurrency(shown ? shown.value : total)}
          </div>
          {shown && total > 0 && <div className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>{pct(shown.value)}</div>}
        </div>
      </div>
      <ul className="thin-scroll w-[44%] max-w-[13rem] max-h-full overflow-y-auto space-y-0.5 shrink-0">
        {slices.map((s, i) => (
          <li
            key={s.name}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(-1)}
            className="flex items-center gap-2 text-xs rounded-lg px-1.5 py-1 transition-colors"
            style={{ background: active === i ? 'var(--hover-tint)' : 'transparent' }}
          >
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
            <span className="flex-1 truncate" style={{ color: 'var(--text-secondary)' }} title={titleCase(s.name)}>{titleCase(s.name)}</span>
            <span className="tabular-nums font-medium" style={{ color: 'var(--text-primary)' }}>{pct(s.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default DonutChart;
