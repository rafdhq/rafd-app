import { AlertCircle, CheckCircle2, WifiOff, RefreshCw, CloudOff, Store, ShieldAlert, ServerCrash } from 'lucide-react';
import Button from './Button';
import { cn } from '../../lib/utils';

export function ErrorState({
  title = 'حدث خطأ',
  description = 'تعذر تحميل البيانات. حاول مرة أخرى.',
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-app bg-danger-soft/40 px-6 py-12 text-center">
      <AlertCircle className="mb-3 h-10 w-10 text-danger" />
      <h3 className="font-semibold text-app">{title}</h3>
      <p className="mt-1 text-sm text-muted">{description}</p>
      {onRetry && (
        <Button className="mt-4" variant="outline" onClick={onRetry}>
          إعادة المحاولة
        </Button>
      )}
    </div>
  );
}

/**
 * Shown when a page's data load cannot proceed because no tenant has resolved
 * yet — distinct from an error (nothing failed) and from an empty list (there
 * IS a store, it just has no rows). Used by useTenantScopedList consumers.
 */
export function NoTenantState({
  title = 'لا يوجد متجر مرتبط بحسابك بعد',
  description = 'أكمل إعداد المتجر أو انتظر تحميل بيانات حسابك، ثم أعد المحاولة.',
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-app bg-subtle px-6 py-12 text-center">
      <Store className="mb-3 h-10 w-10 text-muted" />
      <h3 className="font-semibold text-app">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>
      {onRetry && (
        <Button className="mt-4" variant="outline" onClick={onRetry}>
          إعادة المحاولة
        </Button>
      )}
    </div>
  );
}

/** Permission-denied variant of ErrorState (403) — visually distinct from a generic/server error. */
export function PermissionErrorState({
  description = 'لا تملك صلاحية الوصول لهذه البيانات. تواصل مع مالك المتجر إن كنت تحتاج هذه الصلاحية.',
}: {
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-app bg-warning-soft/40 px-6 py-12 text-center">
      <ShieldAlert className="mb-3 h-10 w-10 text-warning" />
      <h3 className="font-semibold text-app">لا توجد صلاحية</h3>
      <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>
    </div>
  );
}

/** Network/connectivity variant of ErrorState — distinct from a server-side failure. */
export function NetworkErrorState({
  description = 'تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت ثم أعد المحاولة.',
  onRetry,
}: {
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-app bg-info-soft/40 px-6 py-12 text-center">
      <ServerCrash className="mb-3 h-10 w-10 text-info" />
      <h3 className="font-semibold text-app">تعذر الاتصال</h3>
      <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>
      {onRetry && (
        <Button className="mt-4" variant="outline" onClick={onRetry}>
          إعادة المحاولة
        </Button>
      )}
    </div>
  );
}

export function SuccessToast({
  title,
  description,
  className,
}: {
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-2xl border border-app bg-success-soft px-4 py-3 text-success shadow-lift',
        className
      )}
    >
      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
      <div>
        <div className="font-medium">{title}</div>
        {description && <div className="text-sm opacity-90">{description}</div>}
      </div>
    </div>
  );
}

export function OfflineBanner({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="flex items-center justify-center gap-2 bg-[#0f172a] px-3 py-2 text-center text-xs text-amber-200 sm:px-4 sm:text-sm">
      <WifiOff className="h-4 w-4 shrink-0" />
      <span className="break-anywhere">أنت تعمل دون اتصال — سيتم مزامنة التغييرات عند عودة الشبكة</span>
    </div>
  );
}

export function SyncIndicator({
  status,
  lastSyncAt,
  pending,
  onSync,
  compact,
}: {
  status: 'online' | 'offline' | 'syncing' | 'failed';
  lastSyncAt?: string | null;
  pending?: number;
  onSync?: () => void;
  compact?: boolean;
}) {
  const map = {
    online: { label: 'متصل', color: 'text-success', Icon: CheckCircle2 },
    offline: { label: 'دون اتصال', color: 'text-warning', Icon: CloudOff },
    syncing: { label: 'جاري المزامنة', color: 'text-info', Icon: RefreshCw },
    failed: { label: 'فشل المزامنة', color: 'text-danger', Icon: AlertCircle },
  } as const;
  const cfg = map[status];
  const Icon = cfg.Icon;

  return (
    <button
      type="button"
      onClick={onSync}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-app bg-surface px-3 py-1.5 text-xs font-medium shadow-soft',
        cfg.color
      )}
      title={lastSyncAt ? `آخر مزامنة: ${lastSyncAt}` : undefined}
    >
      <span className={cn('h-2 w-2 rounded-full bg-current', status === 'online' && 'pulse-dot')} />
      <Icon className={cn('h-3.5 w-3.5', status === 'syncing' && 'spin-slow')} />
      {!compact && <span>{cfg.label}</span>}
      {!!pending && pending > 0 && (
        <span className="rounded-full bg-warning-soft px-1.5 text-[10px] text-warning">{pending}</span>
      )}
    </button>
  );
}
