import clsx from 'clsx';

const LETTERS = ['ALL', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];

export function AlphabetFilter({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1 mb-4">
      {LETTERS.map((letter) => (
        <button
          key={letter}
          onClick={() => onChange(letter)}
          className={clsx(
            'min-w-[28px] h-7 px-1.5 rounded-md text-xs font-medium transition-colors',
            value === letter ? 'bg-graphite-900 text-white' : 'hover:bg-graphite-100'
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
