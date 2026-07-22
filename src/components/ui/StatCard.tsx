import type { LucideIcon } from 'lucide-react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function StatCard({
  title,
  value,
  change,
  trend,
  icon: Icon,
  tone = 'primary',
}: {
  title: string;
  value: string;
  change?: string;
  trend?: 'up' | 'down' | 'neutral';
  icon: LucideIcon;
  tone?: 'primary' | 'accent' | 'success' | 'info' | 'danger';
}) {
  const tones = {
    primary: 'bg-primary-soft text-primary',
    accent: 'bg-accent-soft text-accent',
    success: 'bg-success-soft text-success',
    info: 'bg-info-soft text-info',
    danger: 'bg-danger-soft text-danger',
  };

  return (
    <div className="rounded-2xl border border-app bg-surface p-4 shadow-soft transition hover:shadow-lift sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted">{title}</p>
          <p className="mt-2 break-anywhere text-xl font-bold tabular tracking-tight text-app sm:text-2xl">{value}</p>
        </div>
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl sm:h-11 sm:w-11', tones[tone])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {change && (
        <div className="mt-3 flex items-center gap-1.5 text-xs">
          {trend === 'up' && <TrendingUp className="h-3.5 w-3.5 text-success" />}
          {trend === 'down' && <TrendingDown className="h-3.5 w-3.5 text-danger" />}
          <span
            className={cn(
              trend === 'up' && 'text-success',
              trend === 'down' && 'text-danger',
              trend === 'neutral' && 'text-muted'
            )}
          >
            {change}
          </span>
        </div>
      )}
    </div>
  );
}
