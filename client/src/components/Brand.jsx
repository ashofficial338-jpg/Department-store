import clsx from 'clsx';
import { useCompanyName } from '../hooks/useCompanyName.js';

// "AURELIA Department Store" reads best as a wordmark over a small descriptor; any other
// company name is shown whole on one line.
function splitName(name) {
  const m = /^(.+?)\s+(department\s+store)$/i.exec(name);
  return m ? { title: m[1], tagline: m[2] } : { title: name, tagline: '' };
}

// The single company identity used across the app: gold monogram + the Company Name from
// System Settings. `tone="dark"` is for dark surfaces (sidebar); `tone="auto"` follows the theme.
export function Brand({ showName = true, tone = 'auto', size = 'md', className }) {
  const name = useCompanyName();
  const { title, tagline } = splitName(name);
  const short = title.length <= 12;
  const mark = size === 'sm' ? 'w-8 h-8 rounded-[10px]' : 'w-10 h-10 rounded-xl';
  return (
    <div className={clsx('flex items-center gap-3 min-w-0', className)} title={name}>
      <div className={clsx('sheen relative bg-gold-gradient flex items-center justify-center text-graphite-950 shrink-0 shadow-gold', mark)}>
        <span className={clsx('relative z-[2] font-extrabold leading-none', size === 'sm' ? 'text-[15px]' : 'text-lg')} role="img" aria-label={showName ? undefined : name} aria-hidden={showName || undefined}>
          {(title.trim()[0] || 'A').toUpperCase()}
        </span>
        <span className="absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/40" />
      </div>
      {showName && (
        <div className="leading-none min-w-0">
          <div
            className={clsx(
              'font-extrabold truncate',
              short ? 'tracking-[0.16em] uppercase' : 'tracking-tight',
              size === 'sm' ? (short ? 'text-[15px]' : 'text-sm') : (short ? 'text-[17px]' : 'text-[15px]'),
              tone === 'dark' && 'text-white',
            )}
            style={tone === 'dark' ? undefined : { color: 'var(--text-primary)' }}
          >
            {title}
          </div>
          {tagline && (
            <div className={clsx('text-[9px] font-semibold tracking-[0.3em] uppercase mt-1.5 truncate', tone === 'dark' ? 'text-gold-400/90' : 'text-gold-600')}>
              {tagline}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Brand;
