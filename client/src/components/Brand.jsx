import clsx from 'clsx';

export const COMPANY_NAME = 'AURELIA';
export const COMPANY_TAGLINE = 'Department Store';

// The single company identity used across the app: gold monogram + wordmark.
// `tone="dark"` is for dark surfaces (sidebar); `tone="auto"` follows the theme.
export function Brand({ showName = true, tone = 'auto', size = 'md', className }) {
  const mark = size === 'sm' ? 'w-8 h-8 text-[15px] rounded-[10px]' : 'w-10 h-10 text-lg rounded-xl';
  return (
    <div className={clsx('flex items-center gap-3 min-w-0', className)}>
      <div className={clsx('sheen relative bg-gold-gradient flex items-center justify-center font-extrabold text-graphite-950 shrink-0 shadow-gold', mark)} aria-hidden={showName}>
        <svg viewBox="0 0 24 24" className="relative z-[2] w-[58%] h-[58%]" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={showName ? undefined : COMPANY_NAME}>
          <path d="M4.5 20 12 4l7.5 16" />
          <path d="M8 13.5h8" />
        </svg>
        <span className="absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/40" />
      </div>
      {showName && (
        <div className="leading-none min-w-0">
          <div
            className={clsx('font-extrabold tracking-[0.16em] truncate', size === 'sm' ? 'text-[15px]' : 'text-[17px]', tone === 'dark' && 'text-white')}
            style={tone === 'dark' ? undefined : { color: 'var(--text-primary)' }}
          >
            {COMPANY_NAME}
          </div>
          <div className={clsx('text-[9px] font-semibold tracking-[0.3em] uppercase mt-1.5 truncate', tone === 'dark' ? 'text-gold-400/90' : 'text-gold-600')}>
            {COMPANY_TAGLINE}
          </div>
        </div>
      )}
    </div>
  );
}

export default Brand;
