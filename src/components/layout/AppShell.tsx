import { useState } from 'react';
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
