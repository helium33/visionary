import { Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { useAuth } from './context/AuthContext';
import { useCreditData } from './hooks/useCreditData';
import CreditManagement from './pages/CreditManagement';
import CarStock from './pages/CarStock';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import Login from './pages/Login';
import Placeholder from './pages/Placeholder';
import Purchasing from './pages/Purchasing';
import Reports from './pages/Reports';
import VoucherCreate from './pages/VoucherCreate';
import VoucherList from './pages/VoucherList';

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-plane text-sm text-ink-secondary">
        Loading…
      </div>
    );
  }

  if (!user) return <Login />;

  return <AuthedApp />;
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
        <Route
          path="/admin/*"
          element={
            <Placeholder
              title="Users & audit"
              scope={[
                'Role assignment (Admin, Sales, Accountant, Warehouse) mirrored into auth claims',
                'Append-only audit log of edited, voided and overridden documents',
                'Master password rotation for credit overrides',
              ]}
            />
          }
        />
        <Route path="*" element={<Placeholder title="Not found" />} />
      </Routes>
    </AppShell>
  );
}
