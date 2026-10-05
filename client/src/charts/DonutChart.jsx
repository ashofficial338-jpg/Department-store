import { useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend, Sector } from 'recharts';
import { CATEGORICAL, TOOLTIP_PROPS } from './palette.js';
import { formatCurrency } from '../utils/format.js';

const titleCase = (s) => String(s ?? '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// Hovered slice expands outward with a soft outer ring.
function ActiveSlice(props) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
  return (
    <g>
      <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 6} startAngle={startAngle} endAngle={endAngle} fill={fill} cornerRadius={6} />
      <Sector cx={cx} cy={cy} innerRadius={outerRadius + 10} outerRadius={outerRadius + 13} startAngle={startAngle} endAngle={endAngle} fill={fill} opacity={0.35} />
    </g>
  );
}

export function DonutChart({ data, nameKey = '_id', valueKey = 'value' }) {
  const [active, setActive] = useState(-1);
  if (!data?.length) return null;
  const total = data.reduce((s, d) => s + (Number(d[valueKey]) || 0), 0);
  const shown = active >= 0 ? data[active] : null;

  return (
    <div className="relative w-full h-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data} dataKey={valueKey} nameKey={nameKey} innerRadius="58%" outerRadius="80%" paddingAngle={3} cornerRadius={6}
            cx="40%" stroke="none" activeIndex={active} activeShape={ActiveSlice}
            onMouseEnter={(_, i) => setActive(i)} onMouseLeave={() => setActive(-1)}
            animationDuration={1200} animationEasing="ease-out"
          >
            {data.map((_, i) => <Cell key={i} fill={CATEGORICAL[i % CATEGORICAL.length]} />)}
          </Pie>
          <Tooltip {...TOOLTIP_PROPS} formatter={(v, n) => [formatCurrency(v), titleCase(n)]} />
          <Legend formatter={titleCase} wrapperStyle={{ fontSize: 11, lineHeight: '20px' }} layout="vertical" verticalAlign="middle" align="right" iconType="circle" iconSize={8} />
        </PieChart>
      </ResponsiveContainer>
      {/* Centre readout: total, or the hovered slice. */}
      <div className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-center" style={{ left: '40%', transform: 'translate(-50%, -50%)' }}>
        <div className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--text-muted)' }}>{shown ? titleCase(shown[nameKey]) : 'Total'}</div>
        <div className="font-display text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
          {formatCurrency(shown ? shown[valueKey] : total)}
        </div>
        {shown && total > 0 && <div className="text-[11px] font-semibold text-gold-600">{((shown[valueKey] / total) * 100).toFixed(1)}%</div>}
      </div>
    </div>
  );
}

export default DonutChart;
