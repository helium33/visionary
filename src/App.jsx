import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { useAuth } from './context/AuthContext';
import { useCreditData } from './hooks/useCreditData';
import CreditManagement from './pages/CreditManagement';
import Admin from './pages/Admin';
import CarStock from './pages/CarStock';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import Login from './pages/Login';
import Placeholder from './pages/Placeholder';
import Purchasing from './pages/Purchasing';
import Reports from './pages/Reports';
import VoucherCreate from './pages/VoucherCreate';
import VoucherList from './pages/VoucherList';

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
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-plane text-sm text-ink-secondary">
        Loading…
      </div>
    );
  }

  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;

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

  return (
    <AppShell sync={sync}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/credit" element={<CreditManagement />} />
        <Route path="/vouchers" element={<VoucherList />} />
        <Route path="/vouchers/new" element={<VoucherCreate />} />
        <Route path="/reports" element={<Reports />} />
        <Route
          path="/shops/*"
          element={
            <Placeholder
              title="Shops & townships"
              scope={[
                'Shop profile with full purchase history (date, model, colour, qty, amount)',
                'Township grouping and per-township performance drill-down',
                'Price tier and credit limit management',
              ]}
            />
          }
        />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/purchasing" element={<Purchasing />} />
        <Route path="/logistics" element={<CarStock />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<Placeholder title="Not found" />} />
      </Routes>
    </AppShell>
  );
}
