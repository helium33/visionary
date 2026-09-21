import { Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { useAuth } from './context/AuthContext';
import { useCreditData } from './hooks/useCreditData';
import CreditManagement from './pages/CreditManagement';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Placeholder from './pages/Placeholder';

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
        <Route
          path="/vouchers/*"
          element={
            <Placeholder
              title="Vouchers"
              scope={[
                'Grid fast entry: pick a model, fill quantities across its colour row (C1 10, C2 5…)',
                'Tiered pricing applied per line: >10 pcs, >50 pcs, VIP shop tier',
                'Invoice shows previous balance, this voucher, payment taken, new balance, 14-day due date',
                'Auto-bundling: one frame deducts one case and one cloth',
                'Print A4 / A5 / 80mm thermal, or share as text to Viber / Telegram',
                'Blocked for LOCKED shops unless an admin override is granted',
              ]}
            />
          }
        />
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
        <Route
          path="/inventory/*"
          element={
            <Placeholder
              title="Inventory"
              scope={[
                'Matrix products: model × colour, with material and shape attributes',
                'Grid fast entry for receiving and ordering',
                'Barcode / QR label printing with model, colour and wholesale price',
                'Low-stock and dead-stock (no sale in 3 months) alerts',
                'Damaged-goods bucket fed by defective returns',
              ]}
            />
          }
        />
        <Route
          path="/purchasing/*"
          element={
            <Placeholder
              title="Purchasing & landed cost"
              scope={[
                'PO capture: factory price, cargo, transport, labeling → actual landed cost per piece',
                'Net profit: revenue − (landed cost + salaries, office, fees)',
              ]}
            />
          }
        />
        <Route
          path="/logistics/*"
          element={
            <Placeholder
              title="Car / bag stock"
              scope={[
                'Transfer stock from the main warehouse to a rep’s car stock location',
                'End-of-day reconciliation: stock out vs vouchers vs cash vs new debt',
              ]}
            />
          }
        />
        <Route
          path="/reports/*"
          element={
            <Placeholder
              title="Reports"
              scope={[
                'Net profit dashboard and expense tracking',
                'Rep commission: sales volume plus a bonus for collection inside 14 days',
                'Township and model performance exports',
              ]}
            />
          }
        />
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
