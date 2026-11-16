// Shared categorical + semantic palette for all charts (recharts) across the app.
// Series colours are CSS variables (see --viz-* in index.css) so each theme gets its own validated
// steps; the order is fixed — assign slots in order, never cycle or reorder them.
export const CATEGORICAL = [
  'var(--viz-1)', 'var(--viz-2)', 'var(--viz-3)', 'var(--viz-4)',
  'var(--viz-5)', 'var(--viz-6)', 'var(--viz-7)', 'var(--viz-8)',
];
export const BRAND = 'var(--viz-1)';
export const NEUTRAL = 'var(--viz-neutral)';
// Older names, kept for existing imports.
export const GOLD = BRAND;
export const GRAPHITE = NEUTRAL;
export const SUCCESS = '#1BAF7A';
export const DANGER = '#E34948';
// Theme-aware via CSS variables so gridlines and axis text stay quiet in dark mode too.
export const GRID = 'var(--border-subtle)';
export const AXIS_TEXT = 'var(--text-muted)';

export default { CATEGORICAL, BRAND, NEUTRAL, GOLD, GRAPHITE, SUCCESS, DANGER, GRID, AXIS_TEXT };

// Frosted tooltip shared by every chart.
export const TOOLTIP_PROPS = {
  cursor: { stroke: 'var(--brand-soft)', strokeOpacity: 0.5, strokeWidth: 1, fill: 'var(--brand-tint)' },
  contentStyle: {
    borderRadius: 14,
    border: '1px solid var(--border-subtle)',
    background: 'color-mix(in srgb, var(--bg-surface) 90%, transparent)',
    backdropFilter: 'blur(12px)',
    boxShadow: '0 18px 40px -18px rgba(15,18,34,0.45)',
    fontSize: 12,
    padding: '10px 12px',
    color: 'var(--text-primary)',
  },
  labelStyle: { fontWeight: 700, marginBottom: 4, color: 'var(--text-primary)' },
  itemStyle: { color: 'var(--text-secondary)', padding: 0 },
};
