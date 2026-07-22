import { Link } from 'react-router-dom';
import { ClipboardList, Clock3, Package, ShoppingCart, Users, Warehouse } from 'lucide-react';
import { useI18n } from '../../contexts/I18nContext';
import { useAuth } from '../../contexts/AuthContext';
import Button from '../../components/ui/Button';

export default function MobileStaff() {
  const { locale, t, toggleLocale, dir } = useI18n();
  const { profile } = useAuth();

  const links = [
    { to: '/pos', icon: ShoppingCart, label: t('pos') },
    { to: '/products', icon: Package, label: t('products') },
    { to: '/inventory', icon: Warehouse, label: t('inventory') },
    { to: '/stocktake', icon: ClipboardList, label: t('stocktake') },
    { to: '/shifts', icon: Clock3, label: t('shifts') },
    { to: '/customers', icon: Users, label: t('customers') },
  ];

  return (
    <div className="min-h-screen bg-muted" dir={dir}>
      <header className="bg-[#042f2e] px-4 py-5 text-teal-50">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-teal-200/80">{t('staffApp')}</div>
            <div className="text-xl font-bold">{profile?.full_name || t('welcome')}</div>
          </div>
          <Button size="sm" variant="secondary" onClick={toggleLocale}>
            {locale === 'ar' ? 'EN' : 'ع'}
          </Button>
        </div>
      </header>
      <main className="space-y-3 p-4">
        {links.map((l) => {
          const Icon = l.icon;
          return (
            <Link
              key={l.to}
              to={l.to}
              className="flex min-h-[64px] items-center gap-3 rounded-2xl border border-app bg-surface px-4 py-3 shadow-soft active:scale-[0.99]"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                <Icon className="h-6 w-6" />
              </span>
              <span className="text-base font-semibold text-app">{l.label}</span>
            </Link>
          );
        })}
      </main>
    </div>
  );
}
