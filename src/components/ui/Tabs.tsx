import { cn } from '../../lib/utils';

export default function Tabs({
  tabs,
  value,
  onChange,
}: {
  tabs: Array<{ id: string; label: string; count?: number }>;
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-2xl border border-app bg-muted p-1">
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              'inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition sm:px-3.5',
              active
                ? 'bg-surface text-app shadow-soft'
                : 'text-muted hover:text-secondary'
            )}
          >
            <span className="whitespace-nowrap">{tab.label}</span>
            {typeof tab.count === 'number' && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[11px] tabular',
                  active ? 'bg-primary-soft text-primary' : 'bg-surface text-muted'
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
