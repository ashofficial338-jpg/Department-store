// Shared categorical + semantic palette for all charts (recharts) across the app.
export const CATEGORICAL = ['#C29A56', '#454856', '#8AA6A3', '#B0725B', '#7E90B0', '#A98CC4', '#6FA687', '#C2745E'];
export const GOLD = '#C29A56';
export const GRAPHITE = '#454856';
export const SUCCESS = '#3F8F6D';
export const DANGER = '#C2483C';
// Theme-aware via CSS variables so gridlines and axis text stay quiet in dark mode too.
export const GRID = 'var(--border-subtle)';
export const AXIS_TEXT = 'var(--text-muted)';

export default { CATEGORICAL, GOLD, GRAPHITE, SUCCESS, DANGER, GRID, AXIS_TEXT };

// Frosted tooltip shared by every chart.
export const TOOLTIP_PROPS = {
  cursor: { stroke: 'rgba(194,154,86,0.35)', strokeWidth: 1, fill: 'rgba(194,154,86,0.06)' },
  contentStyle: {
    borderRadius: 14,
    border: '1px solid rgba(194,154,86,0.25)',
    background: 'color-mix(in srgb, var(--bg-surface) 88%, transparent)',
    backdropFilter: 'blur(12px)',
    boxShadow: '0 18px 40px -18px rgba(17,18,24,0.45)',
    fontSize: 12,
    padding: '10px 12px',
    color: 'var(--text-primary)',
  },
  labelStyle: { fontWeight: 700, marginBottom: 4, color: 'var(--text-primary)' },
  itemStyle: { color: 'var(--text-secondary)', padding: 0 },
};
