import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export function Table({
  children,
  className,
  minWidth = '640px',
}: {
  children: ReactNode;
  className?: string;
  minWidth?: string;
}) {
  return (
    <div className={cn('table-scroll rounded-2xl border border-app', className)}>
      <table
        className="w-full border-collapse text-sm"
        style={{ minWidth }}
      >
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="bg-muted/80 text-secondary">
      <tr>{children}</tr>
    </thead>
  );
}

export function TH({
  children,
  className,
  ...props
}: { children?: ReactNode; className?: string } & ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn('px-3 py-2.5 text-start font-medium whitespace-nowrap sm:px-4 sm:py-3', className)}
      {...props}
    >
      {children}
    </th>
  );
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-[var(--border)] bg-surface">{children}</tbody>;
}

export function TD({
  children,
  className,
  ...props
}: { children?: ReactNode; className?: string } & TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn(
        'px-3 py-2.5 text-app sm:px-4 sm:py-3',
        // default: allow wrapping on narrow screens; pass whitespace-nowrap when needed
        !className?.includes('whitespace-') && 'whitespace-normal sm:whitespace-nowrap',
        className
      )}
      {...props}
    >
      {children}
    </td>
  );
}
