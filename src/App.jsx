import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { LoadingScreen, PageLoader } from './components/ui/LoadingScreen';
import { useAuth } from './context/AuthContext';
import { useLocale } from './context/LocaleContext';
import { useCreditData } from './hooks/useCreditData';
import Login from './pages/Login';
import NoAccess from './pages/NoAccess';
import Placeholder from './pages/Placeholder';

// Each module downloads when first opened rather than all up front, so the
// sign-in screen and the shell paint without waiting on every page's code
// (Recharts alone is the largest chunk in the app).
const Admin = lazy(() => import('./pages/Admin'));
const CarStock = lazy(() => import('./pages/CarStock'));
const CreditManagement = lazy(() => import('./pages/CreditManagement'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Inventory = lazy(() => import('./pages/Inventory'));
const Purchasing = lazy(() => import('./pages/Purchasing'));
const Reports = lazy(() => import('./pages/Reports'));
const Shops = lazy(() => import('./pages/Shops'));
const VoucherCreate = lazy(() => import('./pages/VoucherCreate'));
const VoucherList = lazy(() => import('./pages/VoucherList'));

/**
 * Gates every ERP module behind a signed-in session, and remembers where a
 * visitor was headed so a bookmarked deep link (e.g. /vouchers/new) survives
 * the detour through /login instead of always dropping them back at "/".
 *
 * Wrapped once around the whole module tree rather than per-route: the
 * protection can't be forgotten on a route added later, because there is no
 * second place a route declaration could skip it.
 */
function ProtectedRoute({ children }) {
  const { user, loading, isDemoMode } = useAuth();
  const { t } = useLocale();
  const location = useLocation();

  if (loading) return <LoadingScreen label={t('loading.app')} />;

  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;

  // Signed in, but with no role every Firestore rule denies — don't mount
  // screens that would sit on their loading skeletons forever.
  if (!isDemoMode && !user.role) return <NoAccess />;

  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AuthedApp />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

function AuthedApp() {
  // Lifted so the shell's sync badge reflects the same listener the pages use.
  const { sync } = useCreditData();
  const { t } = useLocale();

  return (
    <AppShell sync={sync}>
      <Suspense fallback={<PageLoader label={t('loading.page')} />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/credit" element={<CreditManagement />} />
          <Route path="/vouchers" element={<VoucherList />} />
          <Route path="/vouchers/new" element={<VoucherCreate />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/shops" element={<Shops />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/purchasing" element={<Purchasing />} />
          <Route path="/logistics" element={<CarStock />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<Placeholder title="Not found" />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}
