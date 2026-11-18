// Shared categorical + semantic palette for all charts (recharts) across the app.
// Validated categorical order (dataviz reference palette; CVD + normal-vision checks pass in light mode).
export const CATEGORICAL = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
export const GOLD = '#4F46E5'; // brand series (revenue); name kept for existing imports
export const GRAPHITE = '#64748B'; // neutral comparison series
export const SUCCESS = '#059669';
export const DANGER = '#DC2626';
// Theme-aware via CSS variables so gridlines and axis text stay quiet in dark mode too.
export const GRID = 'var(--border-subtle)';
export const AXIS_TEXT = 'var(--text-muted)';

export default { CATEGORICAL, GOLD, GRAPHITE, SUCCESS, DANGER, GRID, AXIS_TEXT };

// Frosted tooltip shared by every chart.
export const TOOLTIP_PROPS = {
  cursor: { stroke: 'rgba(79,70,229,0.30)', strokeWidth: 1, fill: 'rgba(79,70,229,0.05)' },
  contentStyle: {
    borderRadius: 10,
    border: '1px solid var(--border-subtle)',
    background: 'color-mix(in srgb, var(--bg-surface) 88%, transparent)',
    backdropFilter: 'blur(12px)',
    boxShadow: '0 18px 40px -18px rgba(15,23,42,0.30)',
    fontSize: 12,
    padding: '10px 12px',
    color: 'var(--text-primary)',
  },
  labelStyle: { fontWeight: 700, marginBottom: 4, color: 'var(--text-primary)' },
  itemStyle: { color: 'var(--text-secondary)', padding: 0 },
};
