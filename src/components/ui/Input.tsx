import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  containerClassName?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, hint, error, leftIcon, rightIcon, containerClassName, id, ...props }, ref) => {
    const inputId = id || props.name;
    return (
      <div className={cn('w-full', containerClassName)}>
        {label && (
          <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-secondary">
            {label}
          </label>
        )}
        <div className="relative">
          {rightIcon && (
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-muted">
              {rightIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              'w-full h-11 rounded-xl border border-app bg-surface px-3.5 text-sm text-app',
              'placeholder:text-muted shadow-soft transition',
              'focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:border-primary',
              'disabled:opacity-60 disabled:cursor-not-allowed',
              rightIcon ? 'pr-10' : undefined,
              leftIcon ? 'pl-10' : undefined,
              error ? 'border-[var(--danger)]' : undefined,
              className
            )}
            {...props}
          />
          {leftIcon && (
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted">
              {leftIcon}
            </div>
          )}
        </div>
        {error ? (
          <p className="mt-1.5 text-xs text-danger">{error}</p>
        ) : hint ? (
          <p className="mt-1.5 text-xs text-muted">{hint}</p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = 'Input';
export default Input;
