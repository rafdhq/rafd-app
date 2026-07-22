import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/utils';

export function Card({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-app bg-surface shadow-soft',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-3 p-4 pb-0 sm:flex-row sm:items-start sm:justify-between sm:p-5 sm:pb-0', className)}>
      <div className="min-w-0">
        <h3 className="break-anywhere text-base font-semibold text-app">{title}</h3>
        {description && <p className="mt-1 break-anywhere text-sm text-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('p-4 sm:p-5', className)}>{children}</div>;
}
