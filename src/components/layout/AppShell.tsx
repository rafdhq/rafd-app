import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import { OfflineBanner } from '../ui/States';
import { useSync } from '../../contexts/SyncContext';
import { TenantProvider, useTenant } from '../../contexts/TenantContext';
import { SyncProvider } from '../../contexts/SyncContext';
import { SubscriptionProvider } from '../../contexts/SubscriptionContext';
import { cn } from '../../lib/utils';
import { useI18n } from '../../contexts/I18nContext';

function ShellInner() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { connection } = useSync();
  const { tenant } = useTenant();
  const { dir } = useI18n();
  const location = useLocation();
  const isPos = location.pathname.startsWith('/pos');
  const isMobileShell =
    location.pathname === '/mobile/manager' || location.pathname === '/mobile/staff';
  const mainRef = useRef<HTMLElement | null>(null);

  // Reset scroll on navigation. <main> is the scroll container (it carries
  // overflow-y-auto) and lives outside <Outlet>, so it is never remounted and
  // its scrollTop otherwise carries over — a new page could open halfway down.
  // Note this deliberately does NOT use window.scrollTo, which would be a
  // no-op here since the window itself does not scroll.
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    // Feature-checked: jsdom (used by the test environment) does not implement
    // Element.scrollTo, so calling it unguarded would throw in any future test
    // that mounts this shell.
    if (typeof el.scrollTo === 'function') el.scrollTo({ top: 0, left: 0 });
    else el.scrollTop = 0;
  }, [location.pathname]);

  if (isMobileShell) {
    return (
      <div className="min-h-screen bg-app" dir={dir}>
        <OfflineBanner visible={connection === 'offline'} />
        <Outlet context={{ tenant }} />
      </div>
    );
  }

  return (
    <div className="app-shell flex bg-app safe-pt safe-px" dir={dir}>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="app-main flex min-h-0 min-w-0 flex-1 flex-col">
        <OfflineBanner visible={connection === 'offline'} />
        <TopBar onMenu={() => setSidebarOpen(true)} />
        <main
          ref={mainRef}
          className={cn(
            'page-container flex-1 page-enter',
            isPos
              ? 'min-h-0 overflow-hidden p-0'
              : 'overflow-x-clip overflow-y-auto p-3 sm:p-4 lg:p-6 safe-pb'
          )}
        >
          <Outlet context={{ tenant }} />
        </main>
      </div>
    </div>
  );
}

export default function AppShell() {
  return (
    <TenantProvider>
      <TenantBoundProviders>
        <ShellInner />
      </TenantBoundProviders>
    </TenantProvider>
  );
}

function TenantBoundProviders({ children }: { children: React.ReactNode }) {
  const { tenant } = useTenant();
  return (
    <SyncProvider tenantId={tenant?.id}>
      <SubscriptionProvider>{children}</SubscriptionProvider>
    </SyncProvider>
  );
}
