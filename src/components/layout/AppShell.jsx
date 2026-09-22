import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  BarChart3,
  Boxes,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Receipt,
  Store,
  Truck,
  Users,
  X,
} from 'lucide-react';
import { ROLE_LABELS } from '../../lib/constants';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import { BrandLogo } from '../brand/BrandLogo';
import { LanguageToggle } from './LanguageToggle';
import { SyncBadge } from './SyncBadge';
import { ThemeToggle } from './ThemeToggle';

// `labelKey` indexes the `nav.*` dictionary namespace (src/i18n/dictionary.js)
// so the sidebar re-labels itself the instant the language toggle is used —
// nothing here hardcodes English.
const NAV = [
  { to: '/', labelKey: 'nav.dashboard', icon: LayoutDashboard, permission: null },
  { to: '/credit', labelKey: 'nav.credit', icon: CreditCard, permission: null },
  { to: '/vouchers', labelKey: 'nav.vouchers', icon: Receipt, permission: 'voucher:create' },
  { to: '/shops', labelKey: 'nav.shops', icon: Store, permission: null },
  { to: '/inventory', labelKey: 'nav.inventory', icon: Boxes, permission: 'inventory:read' },
  { to: '/purchasing', labelKey: 'nav.purchasing', icon: Package, permission: 'po:read' },
  { to: '/logistics', labelKey: 'nav.logistics', icon: Truck, permission: 'stock:car' },
  { to: '/reports', labelKey: 'nav.reports', icon: BarChart3, permission: 'profit:read' },
  { to: '/admin', labelKey: 'nav.admin', icon: Users, permission: '*' },
];

export function AppShell({ sync, children }) {
  const { user, can, isDemoMode, demoUsers, switchDemoUser, logout } = useAuth();
  const { t } = useLocale();
  const [open, setOpen] = useState(false);

  // `permission: null` is open to every signed-in role; '*' is admin-only.
  const items = NAV.filter((item) => {
    if (!item.permission) return true;
    if (item.permission === '*') return user?.role === 'ADMIN';
    return can(item.permission);
  });

  return (
    <div className="min-h-screen bg-plane">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-60 -translate-x-full border-r border-line-hair
          bg-surface transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : ''}`}
      >
        <div className="flex h-14 items-center gap-2 border-b border-line-hair px-4">
          <BrandLogo compact />
          <span className="text-sm font-semibold tracking-tight text-ink">Visionary</span>
          <button
            type="button"
            className="ml-auto rounded p-1 text-ink-muted hover:bg-raised lg:hidden"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          >
            <X size={16} />
          </button>
        </div>

        {/* The toggles live beside the wordmark so they're reachable without
            opening the mobile menu drawer first — language/theme choice
            should not require navigating past the thing it's about to change. */}
        <div className="flex items-center gap-2 border-b border-line-hair px-3 py-2 lg:hidden">
          <LanguageToggle />
          <ThemeToggle />
        </div>

        <nav className="space-y-0.5 p-2">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition ${
                  isActive
                    ? 'bg-raised font-medium text-brand-primary'
                    : 'text-ink-secondary hover:bg-raised hover:text-ink'
                }`
              }
            >
              <item.icon size={16} aria-hidden="true" />
              {t(item.labelKey)}
            </NavLink>
          ))}
        </nav>

        <div className="absolute inset-x-0 bottom-0 border-t border-line-hair p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-ink">{user?.name}</p>
              <p className="text-2xs text-ink-secondary">{ROLE_LABELS[user?.role] ?? user?.role}</p>
            </div>
            <button
              type="button"
              onClick={logout}
              className="flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-2xs text-ink-secondary transition hover:bg-raised hover:text-status-critical"
              aria-label={t('header.logout')}
              title={t('header.logout')}
            >
              <LogOut size={13} aria-hidden="true" />
              {t('header.logout')}
            </button>
          </div>
          {isDemoMode ? (
            <select
              aria-label="Switch demo role"
              className="mt-2 w-full rounded border border-line-hair bg-surface px-2 py-1 text-2xs text-ink-secondary"
              value={user?.id}
              onChange={(e) => switchDemoUser(e.target.value)}
            >
              {demoUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {ROLE_LABELS[u.role]} — {u.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </aside>

      {open ? (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setOpen(false)}
          role="presentation"
        />
      ) : null}

      {/* Main column */}
      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line-hair bg-surface px-4">
          <button
            type="button"
            className="rounded p-1.5 text-ink-secondary hover:bg-raised lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={18} />
          </button>
          <div className="ml-auto flex items-center gap-2">
            {isDemoMode ? (
              <span className="hidden rounded bg-wash-warning px-2 py-1 text-2xs font-medium text-ink sm:inline">
                {t('header.demoData')}
              </span>
            ) : null}
            {/* Visible at every width: the drawer's own copy (above) only
                helps once the drawer is open, and the backdrop that opening
                it adds covers this sticky header anyway. */}
            <LanguageToggle />
            <ThemeToggle />
            <SyncBadge sync={sync} />
          </div>
        </header>

        <main className="mx-auto max-w-[1400px] px-4 py-5">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-sm text-ink-secondary">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
