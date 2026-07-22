import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';
import Button from './Button';
import type { ReactNode } from 'react';

export default function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  actionLabel,
  onAction,
  children,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-app bg-subtle px-4 py-10 text-center sm:px-6 sm:py-14">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
        <Icon className="h-7 w-7" />
      </div>
      <h3 className="text-base font-semibold text-app">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-muted">{description}</p>}
      {actionLabel && onAction && (
        <Button className="mt-5" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
      {children}
    </div>
  );
}
