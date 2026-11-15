import clsx from 'clsx';

const LETTERS = ['ALL', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];

// One swipeable row on phones; wraps on larger screens.
export function AlphabetFilter({ value, onChange }) {
  return (
    <div className="scroll-row sm:flex-wrap sm:overflow-visible gap-1 mb-4 -mx-1 px-1 pb-1 sm:pb-0" role="group" aria-label="Filter by first letter">
      {LETTERS.map((letter) => (
        <button
          key={letter}
          type="button"
          onClick={() => onChange(letter)}
          aria-pressed={value === letter}
          className={clsx(
            'min-w-[34px] h-9 sm:min-w-[28px] sm:h-7 px-1.5 rounded-lg sm:rounded-md text-xs font-medium transition-colors',
            value === letter ? 'bg-graphite-900 text-white dark:bg-gold-500 dark:text-graphite-950' : 'hover:bg-graphite-100'
          )}
          style={value === letter ? {} : { color: 'var(--text-secondary)' }}
        >
          {letter}
        </button>
      ))}
    </div>
  );
}

export default AlphabetFilter;
