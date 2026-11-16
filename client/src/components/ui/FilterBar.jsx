import { Dropdown } from './Dropdown.jsx';

export function FilterBar({ children }) {
  return <div className="flex flex-wrap items-center gap-3 mb-4">{children}</div>;
}

// Animated dropdown used by every list page's filter row. `placeholder` is the "no filter" choice.
export function FilterSelect({ value, onChange, options, placeholder, label }) {
  return (
    <Dropdown
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder || label || 'Select'}
      clearable={!!placeholder}
      ariaLabel={label || placeholder || 'Filter'}
    />
  );
}

export default FilterBar;
