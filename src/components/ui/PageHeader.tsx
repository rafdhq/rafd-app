import type { ReactNode } from 'react';

export default function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumbs?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0">
        {breadcrumbs && <div className="mb-1 text-xs text-muted">{breadcrumbs}</div>}
        <h1 className="break-anywhere text-xl font-bold tracking-tight text-app sm:text-2xl">
          {title}
        </h1>
        {description && (
          <p className="mt-1 break-anywhere text-sm text-muted">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          {actions}
        </div>
      )}
    </div>
  );
}
