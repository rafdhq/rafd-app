import { Link } from 'react-router-dom';
import { BarChart3, Bot, Gift, Layers, RefreshCw, ShoppingCart } from 'lucide-react';
import { useI18n } from '../../contexts/I18nContext';
import { useSync } from '../../contexts/SyncContext';
import { useTenant } from '../../contexts/TenantContext';
import Button from '../../components/ui/Button';

export default function MobileManager() {
  const { locale, t, toggleLocale, dir } = useI18n();
  const { connection, triggerSync, pendingChanges } = useSync();
  const { tenant } = useTenant();

  const links = [
    { to: '/dashboard', icon: BarChart3, label: t('dashboard') },
    { to: '/ai', icon: Bot, label: t('aiAssistant') },
    { to: '/reports', icon: BarChart3, label: t('reports') },
    { to: '/loyalty', icon: Gift, label: t('loyalty') },
    { to: '/pricing', icon: Layers, label: t('pricing') },
    { to: '/pos', icon: ShoppingCart, label: t('pos') },
  ];

  return (
    <div className="min-h-screen bg-app" dir={dir}>
      <header className="sticky top-0 z-10 border-b border-app bg-surface/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-xs text-muted">{t('managerApp')}</div>
            <div className="font-bold text-app">{tenant?.name_ar || tenant?.name || 'RAFD'}</div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={toggleLocale}>
              {locale === 'ar' ? 'EN' : 'ع'}
            </Button>
            <Button size="sm" variant="soft" onClick={() => triggerSync()}>
              <RefreshCw className="h-4 w-4" />
              {pendingChanges || ''}
            </Button>
          </div>
        </div>
        <div className="mt-2 text-xs text-muted">
          {connection === 'offline' ? t('offline') : t('online')}
        </div>
      </header>
      <main className="grid grid-cols-2 gap-3 p-4">
        {links.map((l) => {
          const Icon = l.icon;
          return (
            <Link
              key={l.to}
              to={l.to}
              className="flex min-h-[110px] flex-col items-center justify-center gap-2 rounded-3xl border border-app bg-surface p-4 text-center shadow-soft active:scale-[0.98]"
            >
              <Icon className="h-7 w-7 text-primary" />
              <span className="text-sm font-semibold">{l.label}</span>
            </Link>
          );
        })}
      </main>
    </div>
  );
}
