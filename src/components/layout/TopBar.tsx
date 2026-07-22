import { Bell, Menu, Moon, Search, Sun, LogOut, CreditCard, Languages } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { SyncIndicator } from '../ui/States';
import { useTheme } from '../../contexts/ThemeContext';
import { useSync } from '../../contexts/SyncContext';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { useI18n } from '../../contexts/I18nContext';
import { formatDateTime } from '../../lib/utils';
import Select from '../ui/Select';
import { phaseLabel, statusTone } from '../../lib/subscriptionAccess';

export default function TopBar({ onMenu }: { onMenu: () => void }) {
  const { theme, toggleTheme } = useTheme();
  const { connection, lastSyncAt, pendingChanges, triggerSync } = useSync();
  const { signOut, profile } = useAuth();
  const { branches, currentBranch, setCurrentBranchId, tenant } = useTenant();
  const { phase, daysRemaining, canUseStore } = useSubscription();
  const { locale, toggleLocale, t } = useI18n();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-30 border-b border-app bg-surface/95 backdrop-blur-xl">
      <div className="flex h-14 items-center gap-2 px-2 sm:h-16 sm:gap-3 sm:px-4 lg:px-6">
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 lg:hidden"
          onClick={onMenu}
          aria-label="القائمة"
        >
          <Menu className="h-5 w-5" />
        </Button>

        <div className="min-w-0 flex-1 md:flex-none md:max-w-[200px] lg:max-w-none">
          <div className="truncate text-sm font-semibold text-app">
            {locale === 'ar' ? tenant?.name_ar || tenant?.name || t('appName') : tenant?.name || tenant?.name_ar || t('appName')}
          </div>
          <div className="hidden truncate text-xs text-muted sm:block">
            {t('welcome')}, {profile?.full_name?.split(' ')[0] || ''}
          </div>
        </div>

        <div className="relative mx-auto hidden w-full max-w-md xl:block">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted rtl:right-3 ltr:left-3 ltr:right-auto" />
          <input
            className="h-10 w-full rounded-xl border border-app bg-muted/60 pe-10 ps-3 text-sm text-app placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
            placeholder={t('search')}
            onFocus={() => navigate('/products')}
          />
        </div>

        <div className="ms-auto flex shrink-0 items-center gap-1 sm:gap-2">
          {branches.length > 1 && (
            <div className="hidden w-32 md:block lg:w-36">
              <Select
                value={currentBranch?.id || ''}
                onChange={(e) => setCurrentBranchId(Number(e.target.value))}
                options={branches.map((b) => ({ value: b.id, label: b.name_ar || b.name }))}
              />
            </div>
          )}

          <button
            type="button"
            onClick={() => navigate('/subscription')}
            className="hidden md:inline-flex"
            title="الاشتراك"
          >
            <Badge tone={statusTone(phase)} className="cursor-pointer max-w-[140px] truncate">
              <CreditCard className="h-3 w-3 shrink-0" />
              <span className="truncate">
                {phaseLabel(phase)}
                {canUseStore ? ` · ${daysRemaining}ي` : ''}
              </span>
            </Badge>
          </button>

          <SyncIndicator
            status={connection}
            lastSyncAt={lastSyncAt ? formatDateTime(lastSyncAt) : null}
            pending={pendingChanges}
            onSync={triggerSync}
            compact
          />

          <Button
            variant="ghost"
            size="icon"
            onClick={toggleLocale}
            aria-label={t('language')}
            title={t('language')}
          >
            <Languages className="h-4 w-4" />
            <span className="sr-only">{locale === 'ar' ? 'EN' : 'AR'}</span>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="hidden xs:inline-flex sm:inline-flex"
            onClick={toggleTheme}
            aria-label="theme"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/notifications')}
            aria-label="الإشعارات"
          >
            <Bell className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="hidden sm:inline-flex"
            onClick={async () => {
              await signOut();
              navigate('/login');
            }}
            aria-label="تسجيل الخروج"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
