import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger' | 'soft' | 'accent';
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'icon';
  loading?: boolean;
}

const variants: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'bg-primary text-inverse hover:opacity-90 shadow-soft border border-transparent',
  secondary:
    'bg-muted text-app hover:opacity-90 border border-app',
  ghost: 'bg-transparent text-secondary hover:bg-muted border border-transparent',
  outline: 'bg-transparent text-app border border-app hover:bg-muted',
  danger: 'bg-danger-soft text-danger hover:opacity-90 border border-transparent',
  soft: 'bg-primary-soft text-primary hover:opacity-90 border border-transparent',
  accent: 'bg-accent-soft text-accent hover:opacity-90 border border-transparent',
};

const sizes: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'h-9 px-3 text-sm rounded-lg gap-1.5',
  md: 'h-11 px-4 text-sm rounded-xl gap-2',
  lg: 'h-12 px-5 text-base rounded-xl gap-2',
  xl: 'h-14 px-6 text-base rounded-2xl gap-2.5 font-semibold',
  icon: 'h-11 w-11 rounded-xl p-0 justify-center',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center font-medium transition-all duration-150',
          'disabled:opacity-50 disabled:pointer-events-none touch-target',
          'active:scale-[0.98] whitespace-nowrap shrink-0',
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {loading && <Loader2 className="w-4 h-4 spin-slow" />}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
export default Button;
