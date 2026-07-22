import { cn } from '../../lib/utils';

export function BarChart({
  data,
  height = 180,
  className,
}: {
  data: Array<{ label: string; value: number }>;
  height?: number;
  className?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className={cn('w-full', className)} style={{ height }}>
      <div className="flex h-full items-end gap-2">
        {data.map((d) => {
          const h = (d.value / max) * 100;
          return (
            <div key={d.label} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
              <div
                className="w-full max-w-10 rounded-t-lg bg-[var(--chart-1)]/90 transition-all hover:bg-[var(--chart-1)]"
                style={{ height: `${Math.max(h, 4)}%` }}
                title={`${d.label}: ${d.value}`}
              />
              <span className="text-[10px] text-muted">{d.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DonutChart({
  segments,
  size = 140,
  centerLabel,
  centerValue,
}: {
  segments: Array<{ label: string; value: number; color: string }>;
  size?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  let acc = 0;
  const gradient = segments
    .map((seg) => {
      const start = (acc / total) * 100;
      acc += seg.value;
      const end = (acc / total) * 100;
      return `${seg.color} ${start}% ${end}%`;
    })
    .join(', ');

  return (
    <div className="flex items-center gap-5">
      <div
        className="relative shrink-0 rounded-full"
        style={{
          width: size,
          height: size,
          background: `conic-gradient(${gradient})`,
        }}
      >
        <div
          className="absolute inset-[18%] flex flex-col items-center justify-center rounded-full bg-surface text-center"
        >
          {centerValue && <div className="text-sm font-bold tabular text-app">{centerValue}</div>}
          {centerLabel && <div className="text-[10px] text-muted">{centerLabel}</div>}
        </div>
      </div>
      <div className="space-y-2">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-xs text-secondary">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
            <span>{s.label}</span>
            <span className="ms-auto font-medium tabular text-app">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
