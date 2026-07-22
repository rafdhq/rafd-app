import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Warehouse,
  Truck,
  Users,
  FileText,
  Wallet,
  Receipt,
  BarChart3,
  Settings,
  Building2,
  UserCog,
  Shield,
  Bell,
  Cloud,
  HardDrive,
  CreditCard,
  X,
  Boxes,
  ClipboardList,
  RotateCcw,
  Clock3,
  ScrollText,
  Bot,
  Gift,
  Layers,
  ChefHat,
  FileSpreadsheet,
  Smartphone,
} from 'lucide-react';
import Logo from '../brand/Logo';
import { cn, roleLabel } from '../../lib/utils';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import { useI18n } from '../../contexts/I18nContext';
import { GROUP_I18N, NAV_I18N } from '../../lib/i18n/translations';

const navGroups = [
  {
    key: 'operations' as const,
    items: [
      { to: '/dashboard', icon: LayoutDashboard, roles: ['owner', 'manager', 'accountant'] },
      { to: '/pos', icon: ShoppingCart, roles: ['owner', 'manager', 'cashier'] },
      { to: '/shifts', icon: Clock3, roles: ['owner', 'manager', 'cashier'] },
      { to: '/products', icon: Package, roles: ['owner', 'manager', 'warehouse', 'cashier'] },
      { to: '/inventory', icon: Warehouse, roles: ['owner', 'manager', 'warehouse'] },
      { to: '/stocktake', icon: ClipboardList, roles: ['owner', 'manager', 'warehouse'] },
    ],
  },
  {
    key: 'commerce' as const,
    items: [
      { to: '/purchases', icon: Boxes, roles: ['owner', 'manager', 'warehouse', 'accountant'] },
      { to: '/suppliers', icon: Truck, roles: ['owner', 'manager', 'warehouse', 'accountant'] },
      { to: '/customers', icon: Users, roles: ['owner', 'manager', 'cashier', 'accountant'] },
      { to: '/invoices', icon: FileText, roles: ['owner', 'manager', 'cashier', 'accountant'] },
      { to: '/refunds', icon: RotateCcw, roles: ['owner', 'manager', 'cashier'] },
      { to: '/payments', icon: Wallet, roles: ['owner', 'manager', 'accountant'] },
      { to: '/expenses', icon: Receipt, roles: ['owner', 'manager', 'accountant'] },
      { to: '/reports', icon: BarChart3, roles: ['owner', 'manager', 'accountant'] },
    ],
  },
  {
    key: 'intelligence' as const,
    items: [
      { to: '/ai', icon: Bot, roles: ['owner', 'manager', 'accountant'] },
      { to: '/loyalty', icon: Gift, roles: ['owner', 'manager', 'cashier'] },
      { to: '/pricing', icon: Layers, roles: ['owner', 'manager'] },
      { to: '/recipes', icon: ChefHat, roles: ['owner', 'manager', 'warehouse'] },
      { to: '/import-export', icon: FileSpreadsheet, roles: ['owner', 'manager', 'warehouse', 'accountant'] },
      { to: '/mobile', icon: Smartphone, roles: ['owner', 'manager', 'cashier', 'warehouse', 'accountant'] },
    ],
  },
  {
    key: 'admin' as const,
    items: [
      { to: '/branches', icon: Building2, roles: ['owner', 'manager'] },
      { to: '/users', icon: UserCog, roles: ['owner', 'manager'] },
      { to: '/roles', icon: Shield, roles: ['owner'] },
      { to: '/notifications', icon: Bell, roles: ['owner', 'manager', 'cashier', 'warehouse', 'accountant'] },
      { to: '/audit', icon: ScrollText, roles: ['owner', 'manager', 'accountant'] },
      { to: '/backup', icon: HardDrive, roles: ['owner'] },
      { to: '/sync', icon: Cloud, roles: ['owner', 'manager'] },
      { to: '/subscription', icon: CreditCard, roles: ['owner'] },
      { to: '/settings', icon: Settings, roles: ['owner', 'manager'] },
    ],
  },
];

export default function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { profile } = useAuth();
  const { tenant } = useTenant();
  const { locale } = useI18n();
  const role = profile?.role || 'owner';
  const side = locale === 'ar' ? 'right-0' : 'left-0';
  const borderSide = locale === 'ar' ? 'border-l' : 'border-r';
  const hiddenTranslate = locale === 'ar' ? 'translate-x-full' : '-translate-x-full';

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-40 bg-overlay lg:hidden transition',
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={onClose}
      />
      <aside
        className={cn(
          'fixed inset-y-0 z-50 flex w-[min(288px,88vw)] flex-col border-white/5 bg-sidebar text-sidebar transition-transform duration-200 ease-out lg:static lg:w-72 lg:translate-x-0 lg:shrink-0',
          side,
          borderSide,
          open ? 'translate-x-0 shadow-lift' : `${hiddenTranslate} lg:translate-x-0 lg:shadow-none`
        )}
      >
        <div className="flex items-center justify-between gap-2 px-5 py-5">
          <Logo inverted size="sm" />
          <button className="lg:hidden text-sidebar-muted" onClick={onClose} aria-label="close">
            <X className="h-5 w-5" />
          </button>
        </div>

        {tenant && (
          <div className="mx-4 mb-3 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5">
            {tenant.logo_url ? (
              <img
                src={tenant.logo_url}
                alt=""
                className="h-10 w-10 rounded-xl bg-white/10 object-contain p-1"
              />
            ) : null}
            <div className="min-w-0">
              <div className="text-xs text-sidebar-muted">{locale === 'ar' ? 'المتجر' : 'Store'}</div>
              <div className="truncate text-sm font-semibold text-sidebar">
                {locale === 'ar' ? tenant.name_ar || tenant.name : tenant.name || tenant.name_ar}
              </div>
              <div className="text-[10px] text-sidebar-muted">{tenant.currency || 'YER'}</div>
            </div>
          </div>
        )}

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-6">
          {navGroups.map((group) => {
            const items = group.items.filter((i) => i.roles.includes(role as never));
            if (!items.length) return null;
            return (
              <div key={group.key}>
                <div className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted/70">
                  {GROUP_I18N[group.key][locale]}
                </div>
                <div className="space-y-0.5">
                  {items.map((item) => {
                    const Icon = item.icon;
                    const label = NAV_I18N[item.to]?.[locale] || item.to;
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={onClose}
                        className={({ isActive }) =>
                          cn(
                            'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition',
                            isActive
                              ? 'sidebar-active text-white font-medium'
                              : 'text-sidebar-muted hover:bg-white/5 hover:text-sidebar'
                          )
                        }
                      >
                        <Icon className="h-4.5 w-4.5 shrink-0 opacity-90" strokeWidth={1.75} />
                        <span>{label}</span>
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-500/20 text-sm font-bold text-teal-200">
              {(profile?.full_name || 'U')[0]}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-sidebar">
                {profile?.full_name || (locale === 'ar' ? 'مستخدم' : 'User')}
              </div>
              <div className="text-xs text-sidebar-muted">{roleLabel(profile?.role)}</div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
