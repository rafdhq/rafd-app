import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { I18nProvider } from './contexts/I18nContext';
import ProtectedRoute from './components/ProtectedRoute';
import SuperAdminRoute from './components/SuperAdminRoute';
import AppShell from './components/layout/AppShell';
import AdminShell from './components/layout/AdminShell';
import Login from './pages/Login';
import AdminLogin from './pages/AdminLogin';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import POS from './pages/POS';
import Products from './pages/Products';
import Inventory from './pages/Inventory';
import Purchases from './pages/Purchases';
import Suppliers from './pages/Suppliers';
import Customers from './pages/Customers';
import Invoices from './pages/Invoices';
import Payments from './pages/Payments';
import Expenses from './pages/Expenses';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Branches from './pages/Branches';
import UsersPage from './pages/Users';
import Roles from './pages/Roles';
import Notifications from './pages/Notifications';
import Backup from './pages/Backup';
import CloudSync from './pages/CloudSync';
import Subscription from './pages/Subscription';
import SuperAdmin from './pages/SuperAdmin';
import BrandGuidelines from './pages/BrandGuidelines';
import Shifts from './pages/Shifts';
import Refunds from './pages/Refunds';
import Stocktake from './pages/Stocktake';
import AuditLogs from './pages/AuditLogs';
import AIAssistant from './pages/AIAssistant';
import Loyalty from './pages/Loyalty';
import Pricing from './pages/Pricing';
import Recipes from './pages/Recipes';
import ImportExport from './pages/ImportExport';
import MobileApps from './pages/MobileApps';
import MobileManager from './pages/mobile/MobileManager';
import MobileStaff from './pages/mobile/MobileStaff';
import { handleGoogleRedirect } from './lib/googleAuth';

handleGoogleRedirect();

export default function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/onboarding" element={<Onboarding />} />

              <Route path="/admin/login" element={<AdminLogin />} />
              <Route
                path="/admin"
                element={
                  <SuperAdminRoute>
                    <AdminShell />
                  </SuperAdminRoute>
                }
              >
                <Route index element={<SuperAdmin />} />
              </Route>
              <Route path="/super-admin" element={<Navigate to="/admin" replace />} />

              <Route
                element={
                  <ProtectedRoute>
                    <AppShell />
                  </ProtectedRoute>
                }
              >
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/pos" element={<POS />} />
                <Route path="/products" element={<Products />} />
                <Route path="/inventory" element={<Inventory />} />
                <Route path="/stocktake" element={<Stocktake />} />
                <Route path="/purchases" element={<Purchases />} />
                <Route path="/suppliers" element={<Suppliers />} />
                <Route path="/customers" element={<Customers />} />
                <Route path="/invoices" element={<Invoices />} />
                <Route path="/refunds" element={<Refunds />} />
                <Route path="/shifts" element={<Shifts />} />
                <Route path="/payments" element={<Payments />} />
                <Route path="/expenses" element={<Expenses />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/ai" element={<AIAssistant />} />
                <Route path="/loyalty" element={<Loyalty />} />
                <Route path="/pricing" element={<Pricing />} />
                <Route path="/recipes" element={<Recipes />} />
                <Route path="/import-export" element={<ImportExport />} />
                <Route path="/mobile" element={<MobileApps />} />
                <Route path="/mobile/manager" element={<MobileManager />} />
                <Route path="/mobile/staff" element={<MobileStaff />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/branches" element={<Branches />} />
                <Route path="/users" element={<UsersPage />} />
                <Route path="/roles" element={<Roles />} />
                <Route path="/notifications" element={<Notifications />} />
                <Route path="/audit" element={<AuditLogs />} />
                <Route path="/backup" element={<Backup />} />
                <Route path="/sync" element={<CloudSync />} />
                <Route path="/subscription" element={<Subscription />} />
                <Route path="/brand" element={<BrandGuidelines />} />
              </Route>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
