import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';
import { ChevronDown } from 'lucide-react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: Array<{ value: string | number; label: string }>;
  placeholder?: string;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, options, placeholder, id, ...props }, ref) => {
    const selectId = id || props.name;
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={selectId} className="mb-1.5 block text-sm font-medium text-secondary">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={cn(
              'w-full h-11 appearance-none rounded-xl border border-app bg-surface px-3.5 pe-10 text-sm text-app',
              'shadow-soft transition focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:border-primary',
              error && 'border-[var(--danger)]',
              className
            )}
            {...props}
          >
            {placeholder && (
              <option value="">{placeholder}</option>
            )}
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
        </div>
        {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
      </div>
    );
  }
);

Select.displayName = 'Select';
export default Select;
