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
| **14-day credit engine** | Complete — `src/domain/`, 51 unit tests across credit and voucher rules |
| **Credit control dashboard** | Complete — ageing, worklist, FIFO payments, master-password release, statements |
| **Main dashboard** | Complete — receivables, township/shop rankings, sales vs collections |
| **Grid fast entry + vouchers** | Complete — matrix entry, tiered pricing, auto-bundling, credit gate, A4/A5/thermal print, chat share |
| **Inventory** | Complete — stock matrix, EAN-13/QR label printing, dead-stock and low-stock reports |
| **Purchasing & landed cost** | Complete — PO tracking, charge apportionment, receiving with cost write-back, expenses |
| **Reports** | Complete — net profit bridge, model profitability, rep commissions |
| **Car stock** | Complete — load a bag, reconcile stock, cash and debt on return |
| **PWA + offline** | Complete — `persistentLocalCache`, service worker, sync badge |
| Users & audit | Routed stub; lists its planned scope on screen |

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
    │   ├── pricing.js             Tier resolution — best single tier, never stacked
    │   ├── voucher.js             Cart pricing, auto-bundling, stock check, invoice maths
    │   ├── barcode.js             EAN-13 encoder and check digit; QR payloads
    │   ├── inventory.js           Stock valuation, dead-stock bands, label runs
    │   ├── landedCost.js          Charge apportionment, receipt plans, margins
    │   ├── purchasing.js          PO arrival state, expense roll-ups
    │   ├── profit.js              P&L, the revenue→net bridge, model profitability
    │   ├── commission.js          Rep volume plus the on-time collection bonus
    │   ├── carStock.js            Trip reconciliation: stock, cash and debt
    │   ├── credit.test.js         Boundary tests: day 11/12/14/15/22
    │   ├── voucher.test.js        Tier thresholds, bundling, stock, invoice arithmetic
    │   ├── barcode.test.js        Symbol encoding against the GS1 worked example
    │   ├── inventory.test.js      Dead-stock bands, valuation, label runs
    │   ├── landedCost.test.js     Apportionment balance, FX, short deliveries
    │   ├── purchasing.test.js     Late shipments, expense windows
    │   ├── profit.test.js         Frozen COGS, the bridge, commission split
    │   └── carStock.test.js       Bag arithmetic, cash vs phone, settlement
    ├── services/                ← Side effects. Everything that writes.
    │   ├── dataSource.js          One subscription layer over Firestore or demo data
    │   ├── creditService.js       Override, payments (batched), holds, credit notes
    │   ├── voucherService.js      Voucher write: one batch for stock, debt and journal
    │   ├── statementService.js    Viber/Telegram message + printable A5 statement
    │   └── auditService.js        Append-only audit trail
    ├── hooks/
    │   ├── useCreditData.js       Streams shops + open vouchers → derived portfolio
    │   ├── useCatalogue.js        Products, with colour variants loaded per model
    │   ├── useSalesAnalytics.js   Township/shop rankings, weekly series
    │   ├── useOnlineStatus.js
    │   └── useToday.js            Ticking "today" so ageing rolls over at midnight
    ├── context/AuthContext.jsx    Auth + role, with a demo-mode role switcher
    ├── components/
    │   ├── ui/                    Card, Button, Modal, StatTile, StatusPill, Toast
    │   ├── charts/                BarList, AgingBar, TrendChart, shared tooltip
    │   ├── credit/                DueMeter, CollectionTable, and the four dialogs
    │   ├── voucher/               ModelPicker, GridFastEntry, lines, totals, print
    │   ├── inventory/             StockMatrix, barcode/QR SVG, label sheet, alert tables
    │   ├── purchasing/            PoTable, landed-cost breakdown, receiving, expenses
    │   ├── reports/               Commission table with the on-time meter
    │   ├── carstock/              Trip reconciliation panel
    │   └── layout/                AppShell, SyncBadge
    ├── pages/
    │   ├── Dashboard.jsx
    │   ├── CreditManagement.jsx
    │   ├── VoucherCreate.jsx      Grid fast entry → invoice → print/share
    │   ├── VoucherList.jsx
    │   ├── Inventory.jsx          Stock matrix, labels, dead stock
    │   ├── Purchasing.jsx         Landed cost, receiving, general expenses
    │   ├── Reports.jsx            Net profit bridge, model margins, commissions
    │   ├── CarStock.jsx           Load a bag, count it back in
    │   ├── Login.jsx
    │   └── Placeholder.jsx        Honest stubs for the unbuilt modules
    ├── lib/                       firebase.js, constants.js, dates.js, format.js
    └── data/                      demoData.js (shops, vouchers), demoProducts.js (matrix)
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

## Grid fast entry & pricing

Pick a model, type quantities down its colour row. Enter and the arrow keys move
between colours and Enter on the last row commits the model, so a laptop order is typed
without a mouse; the steppers do the same job under a thumb on a phone.

Three rules govern what the grid produces:

**Quantity tiers are earned per model, not per colour line.** Six of C1 plus six of C2 is
twelve pieces of PB-2026, and both lines get the bulk rate. Pricing each colour separately
would deny a discount the shop plainly qualifies for, and reps would just split vouchers to
work around it.

**Tiers never stack.** A VIP shop buying 60 pieces gets whichever single tier is cheaper for
it — not VIP plus bulk. Stacking is the usual way a wholesale system quietly sells below
cost.

**Bundles move stock but never price.** One frame ships with one case and one cloth at no
charge, so they stay off the invoice total and still leave the warehouse — otherwise the case
count drifts from reality within a month. A missing cloth warns; it does not block a
K 2,000,000 frame order.

## Inventory, labels and dead stock

Dead stock is derived from `products.lastSoldAt` against today — the same shape as credit
status. A model goes dead at midnight on its ninetieth day with nothing written and nobody
notified, so the flag has to be computed at read time or it is wrong by definition. Bands sit at
60 (slowing), 90 (dead) and 180 days (stranded), and the column that matters is the **capital at
landed cost**, because that is what justifies a clearance price.

Barcodes are **encoded in `src/domain/barcode.js`, not pulled from a library**: EAN-13 is a fixed
table and forty lines of logic, it has to work offline, and a wrong barcode is an expensive thing
to discover at a shop counter. The encoder is tested against the GS1 worked example
(`5901234123457`) including the parity trick that carries the first digit. Labels render as SVG so
the printer rasterises them at its own resolution — sharp at 203dpi on a thermal head and at
600dpi on an office laser — and are sized in millimetres, because label stock is sold in
millimetres and pixel sizing would misalign every sticker on the sheet.

## Landed cost

Factory price + cargo + transport + labeling = actual cost. Receiving a purchase order is the
one moment estimated cost becomes real: it writes the landed figure back to
`products.costing.actualCost`, and every margin, stock valuation and dead-stock capital number in
the system reads that single field.

Two rules the apportionment is strict about:

**The charges balance to the kyat.** Spreading K 420,000 of cargo across eleven lines by naive
rounding loses or invents a few kyat every time, and those compound into a cost base nobody can
reconcile with the shipping invoice. A largest-remainder split makes the shares sum to the total
exactly, always.

**A short delivery makes each surviving piece dearer, not cheaper.** At receipt the charges are
spread over what actually arrived, not over what was ordered — the freight invoice being entered
covers the shipment that came, so apportioning it over quantities that never turned up would put
real money on phantom pieces. Ten of seventy arriving moves that line from K 8,088 to K 8,387 a
piece, and the margin column drops to match.

The basis (by value or by quantity) is **stored on the purchase order**, because the two give
materially different unit costs — a titanium frame and a kids' frame take the same carton space
but not the same invoice line — and neither is inherently correct. The business has to be able to
say which it used.

## Net profit and commissions

Net profit is revenue − cost of goods − general expenses, computed from documents rather than a
stored summary. Two decisions make it honest:

**Cost of goods is read off the voucher, not the product.** Every sold line carries the landed
cost it was sold at. Looking the cost up on the product today would mean that receiving a
shipment at a new landed price silently restates last quarter's profit — the figure would move
without a single sale changing. Where an older voucher predates that field, the product's current
cost is used and the result is flagged on screen, because a number the business might act on
should say when it is a guess.

**Commission has two halves, and the split is the point.** Paying on sales alone rewards a rep
for selling to shops that never pay: the voucher counts the day it is written and the debt
becomes someone else's problem. So base commission is a percentage of what the rep sold, and the
bonus is a percentage of what they *collected inside the 14-day term* — the same `payments.onTime`
flag the payment write sets. The table shows the bonus forgone by collecting late, so a rep can
see what the incentive is actually worth.

The profit bridge is drawn as a horizontal waterfall: revenue, less cost of goods, gross profit,
then each expense category, landing on net. Its scale includes zero and any negative running
total, so a loss-making period draws correctly instead of collapsing — a chart that cannot show a
loss is a chart that hides one.

## Car stock

A rep leaves with a bag of frames and comes back with some frames, some cash and some new debt.
All three have to tie out together or the business does not know what it owns.

**The expected figure is built from the trip's own movements** — took, sold, should have — rather
than read off the live stock field. "You took 12, sold 8, so you should have 4" is an argument a
rep can check standing at the counter; "the system says 4" is not, and a reconciliation nobody
trusts gets signed without counting. It also works offline, where the live figure may be
mid-sync. `sold` comes from the vouchers whose `locationId` is that bag, which is why vouchers
record where they were written.

**Only physical cash is expected back.** A shop that paid by KBZPay has already moved the money;
counting it as cash the rep owes would show a shortfall on every single trip. The panel shows
both figures side by side and only the cash half has to be handed over.

**New credit is not a variance.** Selling on 14-day terms is the job — putting it in the same
column as missing stock would train everyone to ignore the column. It is reported as a result and
handed to credit control, where the clock is already running.

Settling writes the difference as an explicit signed adjustment into the stock journal. A
shortage is a loss somebody has to account for, so it leaves a record rather than being absorbed
into a corrected stock figure.

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
