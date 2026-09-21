# Visionary — B2B Wholesale Eyewear POS & ERP

Wholesale frames and cases for Yangon optical shops. Built around a **strict 14-day credit
term**, a **model × colour matrix inventory**, and **offline-first field sales** — reps issue
vouchers from a phone in a market street with no signal and sync when they get back.

React (Vite) · Tailwind · Firebase Firestore + Auth · PWA.

---

## What is built so far

| Module | State |
|---|---|
| **Firestore schema** | Complete — `docs/FIRESTORE_SCHEMA.md`, `firestore.rules`, `firestore.indexes.json` |
| **14-day credit engine** | Complete — `src/domain/`, 22 unit tests |
| **Credit control dashboard** | Complete — ageing, worklist, FIFO payments, master-password release, statements |
| **Main dashboard** | Complete — receivables, township/shop rankings, sales vs collections |
| **PWA + offline** | Complete — `persistentLocalCache`, service worker, sync badge |
| Vouchers · Inventory · Purchasing · Car stock · Reports · Admin | Routed stubs; each lists its planned scope on screen |

## Running it

```bash
npm install
npm run dev      # http://localhost:5173 — boots on seeded demo data
npm test         # credit-rule unit tests
npm run build
```

With no Firebase project configured the app runs in **demo mode** against
`src/data/demoData.js`, so the UI is reviewable without credentials. The demo master password
for releasing a locked shop is `0000`, and the sidebar has a role switcher for checking the
RBAC surface.

To point it at a real project: copy `.env.example` to `.env.local`, fill in the Firebase web
config, set `VITE_DEMO_MODE=false`, then

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

---

## Folder structure

```
visionary/
├── docs/
│   └── FIRESTORE_SCHEMA.md      Collections, offline strategy, rules rationale
├── firestore.rules              Role-based security rules (the real enforcement)
├── firestore.indexes.json       Composite indexes for the ageing + analytics queries
├── public/
│   ├── favicon.svg
│   └── icons/                   PWA icons (192, 512, 512-maskable)
└── src/
    ├── domain/                  ← PURE BUSINESS RULES. No React, no Firestore.
    │   ├── credit.js              14-day ageing, lock derivation, the voucher gate
    │   ├── allocation.js          FIFO payment + credit-note allocation
    │   └── credit.test.js         Boundary tests: day 11/12/14/15/22
    ├── services/                ← Side effects. Everything that writes.
    │   ├── dataSource.js          One subscription layer over Firestore or demo data
    │   ├── creditService.js       Override, payments (batched), holds, credit notes
    │   ├── statementService.js    Viber/Telegram message + printable A5 statement
    │   └── auditService.js        Append-only audit trail
    ├── hooks/
    │   ├── useCreditData.js       Streams shops + open vouchers → derived portfolio
    │   ├── useSalesAnalytics.js   Township/shop rankings, weekly series
    │   ├── useOnlineStatus.js
    │   └── useToday.js            Ticking "today" so ageing rolls over at midnight
    ├── context/AuthContext.jsx    Auth + role, with a demo-mode role switcher
    ├── components/
    │   ├── ui/                    Card, Button, Modal, StatTile, StatusPill, Toast
    │   ├── charts/                BarList, AgingBar, TrendChart, shared tooltip
    │   ├── credit/                DueMeter, CollectionTable, and the four dialogs
    │   └── layout/                AppShell, SyncBadge
    ├── pages/
    │   ├── Dashboard.jsx
    │   ├── CreditManagement.jsx
    │   ├── Login.jsx
    │   └── Placeholder.jsx        Honest stubs for the unbuilt modules
    ├── lib/                       firebase.js, constants.js, dates.js, format.js
    └── data/demoData.js
```

**The one structural rule:** business rules live in `src/domain/` as pure functions of
`(documents, today)`. They never read the clock, never touch Firestore, and never import
React. Everything else — pages, services, the Cloud Functions sketched in the schema doc —
calls into them, so the dashboard, the voucher screen and the server cannot disagree about who
is locked.

---

## The 14-day rule in one page

```
issue ──▶ ACTIVE ──day 12──▶ WATCH ──day 15──▶ LOCKED ──▶ new vouchers blocked
                                                  │
                          payment clears oldest ──┤
                          admin override (30 min) ┘
```

Three things are worth knowing before changing any of it:

**1. Status is derived, never stored.** A shop that is fine at 08:00 is locked at midnight with
no document having changed — time passed, that is all. `shops.credit.status` exists as a query
cache; every gating decision recomputes from `vouchers.dueDate` against the current date. That
is also what makes the lock correct offline.

**2. The lock is enforced in three places.** The UI (convenience), the security rules (cheap,
uses a cached flag), and an `onVoucherWrite` Cloud Function (authoritative, sees the true
clock). A rep who is offline *can* write a voucher against a shop that locked while they were
out of signal; it syncs, the function voids it and audits it. The business would rather reverse
one voucher than have a rep blocked by a dead network.

**3. The master password is verified on the server.** A client-side check ships the hash in the
bundle. Rules deny `credit.override` to every client, so only the callable can grant it — which
makes releasing a shop an online-only action on purpose, not by accident.

Payments allocate **oldest voucher first**, because the oldest is the one about to trip the
lock. The allocation is computed by the same pure function that the write uses, so the preview
the accountant approves is exactly what gets committed — offline included.

---

## Design notes

Charts and status colours come from a validated palette: categorical hues are assigned in a
fixed order and checked for colour-vision separation, and the four status colours
(good/warning/serious/critical) are reserved — they never double as a series colour. Every
status is paired with an icon and a word, so nothing depends on colour alone. Light and dark
are both explicit token sets in `src/index.css`; components carry no `dark:` variants.
