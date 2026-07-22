import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import Button from './Button';

export default function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const widths = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-6xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-3 md:p-4 safe-px">
      <div className="absolute inset-0 bg-overlay" onClick={onClose} />
      <div
        role="dialog"
        aria-modal
        className={cn(
          'relative z-10 flex w-full max-h-[min(92dvh,920px)] flex-col overflow-hidden',
          'rounded-t-3xl border border-app bg-surface shadow-lift page-enter sm:rounded-3xl',
          widths[size]
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-app px-4 py-3 sm:px-5 sm:py-4">
          <div className="min-w-0">
            <h2 className="break-anywhere text-base font-semibold text-app sm:text-lg">{title}</h2>
            {description && (
              <p className="mt-1 break-anywhere text-xs text-muted sm:text-sm">{description}</p>
            )}
          </div>
          <Button variant="ghost" size="icon" className="shrink-0" onClick={onClose} aria-label="إغلاق">
            <X className="w-5 h-5" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-5 sm:py-4">
          {children}
        </div>
        {footer && (
          <div className="shrink-0 border-t border-app px-4 py-3 sm:px-5 sm:py-4 safe-pb">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
