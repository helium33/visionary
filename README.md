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
| **Reports** | Complete — net profit bridge, model profitability, rep commissions, **+ Shops & townships analytics** |
| **Car stock** | Complete — load a bag, reconcile stock, cash and debt on return |
| **Users & audit** | Complete — role assignment, an append-only audit log, master-password rotation |
| **Bilingual UI (EN/MM)** | Nav, header, Dashboard, Credit Management and Reports — a language toggle, placeholder Myanmar copy |
| **Yangon district mapping** | Complete — 4 districts ↔ townships, auto-derived, feeds the district/township charts |
| **Brand identity & auth** | Complete — Plan B Vision Eyewears mark, brand-primary theme, Firebase Email/Password + Google sign-in, `<ProtectedRoute>` |
| **Shops & townships** | Complete — directory grouped by township, shop profile with full purchase history, price-tier/credit-limit management |
| **PWA + offline** | Complete — `persistentLocalCache`, service worker, sync badge |

## Running it

```bash
npm install
npm run dev      # http://localhost:5173 — boots on seeded demo data
npm test         # credit-rule unit tests
npm run build
```

With no Firebase project configured the app runs in **demo mode** against
`src/data/demoData.js`, so the UI is reviewable without credentials — `/login` never appears,
the sidebar has a role switcher for checking the RBAC surface, and its Logout button just resets
to the first demo user. The demo master password for releasing a locked shop is `0000`.

To point it at a real project: copy `.env.example` to `.env.local`, fill in the Firebase web
config, set `VITE_DEMO_MODE=false`, then create at least one user both in Firebase
Authentication (email/password) and in Firestore's `users` collection (so the app has a role to
read for them) before signing in — see `docs/FIRESTORE_SCHEMA.md`'s `users/{uid}` section — then

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
    │   ├── permissions.js         Renders the role → capability matrix from one source list
    │   ├── audit.js                Turns raw audit entries into a readable, filterable log
    │   ├── townshipAnalytics.js   District/township/shop rollups for the Reports tab
    │   └── shopPurchaseHistory.js One row per sold line — date, model, colour, qty, amount
    │   ├── credit.test.js         Boundary tests: day 11/12/14/15/22
    │   ├── voucher.test.js        Tier thresholds, bundling, stock, invoice arithmetic
    │   ├── barcode.test.js        Symbol encoding against the GS1 worked example
    │   ├── inventory.test.js      Dead-stock bands, valuation, label runs
    │   ├── landedCost.test.js     Apportionment balance, FX, short deliveries
    │   ├── purchasing.test.js     Late shipments, expense windows
    │   ├── profit.test.js         Frozen COGS, the bridge, commission split
    │   ├── carStock.test.js       Bag arithmetic, cash vs phone, settlement
    │   ├── permissions.test.js    The matrix never invents or drops a capability
    │   ├── audit.test.js          Human-readable descriptions, filtering, sort order
    │   ├── townshipAnalytics.test.js
    │   └── shopPurchaseHistory.test.js
    ├── i18n/                     Hand-rolled EN/MM dictionary — see "Bilingual support" below
    │   ├── dictionary.js           Nested {en, mm} strings, dot-path keys
    │   ├── translate.js            Lookup + {placeholder} interpolation, never throws
    │   └── translate.test.js
    ├── constants/
    │   ├── districts.js            Yangon district ↔ township mapping — see below
    │   └── districts.test.js
    ├── services/                ← Side effects. Everything that writes.
    │   ├── dataSource.js          One subscription layer over Firestore or demo data
    │   ├── creditService.js       Override, payments (batched), holds, credit notes
    │   ├── voucherService.js      Voucher write: one batch for stock, debt and journal
    │   ├── statementService.js    Viber/Telegram message + printable A5 statement
    │   ├── shopService.js         Create/update a shop; code generation; audit logging
    │   └── auditService.js        Append-only audit trail
    ├── hooks/
    │   ├── useCreditData.js       Streams shops + open vouchers → derived portfolio
    │   ├── useCatalogue.js        Products, with colour variants loaded per model
    │   ├── useSalesAnalytics.js   Township/shop rankings, weekly series
    │   ├── useShopsData.js        Shops + vouchers → per-shop purchase summaries, by district
    │   ├── useOnlineStatus.js
    │   └── useToday.js            Ticking "today" so ageing rolls over at midnight
    ├── context/
    │   ├── AuthContext.jsx         Auth + role, with a demo-mode role switcher
    │   └── LocaleContext.jsx       Current locale + t(), persisted to localStorage
    ├── components/
    │   ├── brand/                  BrandLogo — the Plan B Vision Eyewears mark, full + compact
    │   ├── ui/                    Card, Button, Modal, StatTile, StatusPill, Toast
    │   ├── charts/                BarList, AgingBar, TrendChart, shared tooltip, rechartsTheme (CSS-var Recharts theme)
    │   ├── credit/                DueMeter, CollectionTable, the four dialogs, CreditCharts (collected/outstanding donut, debt-ageing bar)
    │   ├── voucher/               ModelPicker, GridFastEntry, lines, totals, print
    │   ├── inventory/             StockMatrix, barcode/QR SVG, label sheet, alert tables
    │   ├── purchasing/            PoTable, landed-cost breakdown, receiving, expenses
    │   ├── reports/               Commission table; TownshipCharts + ShopsTownshipsReport (district/township/top-shop charts)
    │   ├── carstock/              Trip reconciliation panel
    │   ├── shops/                 ShopFormModal (create/edit), ShopProfilePanel (history + terms)
    │   └── admin/                 Users table, permission matrix, audit log, password rotation
    │   └── layout/                AppShell, SyncBadge, LanguageToggle
    ├── pages/
    │   ├── Dashboard.jsx
    │   ├── CreditManagement.jsx
    │   ├── VoucherCreate.jsx      Grid fast entry → invoice → print/share
    │   ├── VoucherList.jsx
    │   ├── Inventory.jsx          Stock matrix, labels, dead stock
    │   ├── Purchasing.jsx         Landed cost, receiving, general expenses
    │   ├── Reports.jsx            Net profit bridge, model margins, commissions
    │   ├── CarStock.jsx           Load a bag, count it back in
    │   ├── Shops.jsx              Directory by township, profile, price tier/credit limit
    │   └── Admin.jsx               Role assignment, the audit log, password rotation
    │   ├── Login.jsx
    │   └── Placeholder.jsx        Honest stub for unmatched routes ("Not found")
    ├── lib/                       firebase.js, constants.js, dates.js, format.js
    └── data/                      demoData.js (shops, vouchers), demoProducts.js (matrix), demoShopsStore.js
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

## Users & audit

Two things live here because they are about trust rather than the day-to-day business: who is
allowed to do what, and a record of what they actually did.

**The permission matrix is rendered, not re-specified.** `src/lib/constants.js#PERMISSIONS` is
the one list every `can()` check in the app already gates on — this screen only turns it into a
table grouped by area, one column per role. It grants nothing on its own; editing it would mean
the screen and the security rules could drift apart, which is exactly the failure mode a
permission matrix exists to prevent.

**The audit log is not fetched specially.** Every service module in this app already calls
`logAudit` on the writes that matter — a voucher, a payment, an override, a received PO, a
settled trip, a role change. This page is the first place that reads those entries back, turns
them into one-line descriptions, and lets them be filtered by actor, action and date. Nothing
here can be edited or deleted, not by this screen and not by the security rules (`allow update,
delete: if false`, admins included) — an audit log an admin can rewrite is not an audit log.

**Rotating the master password requires the current one.** A desk left unlocked should not be
enough to lock every other admin out of releasing a locked shop — see the note on `settings/config`
in the schema doc for why the hash itself never reaches the browser either way.

One bug this pass caught by driving the screen in a browser rather than trusting the tests alone:
the audit log's date filter capped its *upper* bound at `today`, a value that only refreshes at
midnight (see `useToday`) — so an entry logged seconds after the page loaded was silently
filtered out until the next calendar day. Fixed by dropping the upper bound entirely: nothing is
ever dated later than now, so the start of the window is all that needs bounding.

Payments allocate **oldest voucher first**, because the oldest is the one about to trip the
lock. The allocation is computed by the same pure function that the write uses, so the preview
the accountant approves is exactly what gets committed — offline included.

## Bilingual support (EN/MM)

Hand-rolled, not react-i18next. `src/i18n/dictionary.js` is a plain nested `{en, mm}` object
keyed by dot-path (`credit.totalOutstanding`), looked up and `{placeholder}`-interpolated by
`src/i18n/translate.js`, with a locale → English → raw-key fallback that never throws. The whole
thing is a few KB; this app has no plural rules or per-locale number formats to justify shipping
`i18next` + `react-i18next` + a language detector. Coverage is deliberately scoped to what was
asked for — nav, header, Dashboard, Credit Management, Reports — not the rest of the app; every
other page keeps its English copy until a namespace is added for it. The Myanmar column is real,
sensible placeholder text the project owner asked to refine themselves, not filler.

`LocaleProvider` (`src/context/LocaleContext.jsx`) holds the current locale, persists it to
`localStorage`, and sets `document.documentElement.lang` plus a `body.mm-locale` class so
`index.css` can swap in a Myanmar-capable font stack. `LanguageToggle` is mounted twice — once in
the sticky mobile header, once inside the drawer — so it is reachable whether or not the drawer
is open. (An earlier version rendered only the drawer copy on mobile, so a phone user had to open
the menu just to switch languages — caught and fixed while browser-verifying the Reports tab,
not while building the toggle itself.)

**A Recharts pitfall worth recording.** The Credit Management donut originally fed the translated
string `t('credit.collected')` into the Pie's `nameKey`. Recharts uses that field as a stable
identity to match sectors across renders for its enter/update transitions — a value that changes
on every locale toggle gives it nothing stable to match, so it silently re-derived sector *and*
legend order from scratch each time, occasionally swapping which colour meant "Collected" and
which meant "Outstanding" with no console error and nothing visibly broken except the mislabel
itself. The fix, applied throughout `CreditCharts.jsx` and `TownshipCharts.jsx`: identity fields
a chart library uses for reconciliation (`nameKey`, a `dataKey` matched across renders) stay
locale-invariant English/code strings, always; translated text only ever appears inside a label
or tooltip formatter, or a hand-rolled legend built from the app's own data — never in a field a
chart library uses to recognise "the same slice as last render."

## Shop & township analytics

Reports gained a second tab — Shops & townships — built on `src/domain/townshipAnalytics.js`,
pure rollups (`districtSales`, `townshipSales`, `topShops`) that share the exact revenue
definition the Profit tab already uses (`isRevenueVoucher` from `profit.js`: no consignment
stock, no voided vouchers), so the two tabs can never disagree about what a period's revenue was.

**District is derived, never stored.** `src/constants/districts.js` maps Yangon's ~28
wholesale-relevant townships into the four administrative districts, each with its own Burmese
name. A shop's district is always `getDistrictForTownship(shop.township)`, computed at read
time — the same rule the app already applies to credit status and dead stock. Re-mapping a
township (the three Dagon Myothit "new town" satellites are genuinely cited differently across
sources) is a one-line edit that reclassifies every past voucher the next time a report runs;
nothing to migrate.

**Revenue and volume are two charts, not one.** Kyat and pieces-sold are different scales, and
this app's charts never put two different-scale measures on one y-axis, so "revenue and volume
across the four districts" became two small-multiple bar charts side by side rather than one
dual-axis chart. Township and shop charts run horizontal instead — a district holds up to 13
townships and shop names run long, and a vertical axis either rotates the labels or truncates
them; horizontal bars give a long name the width it needs regardless of screen size. The
leaderboard follows the same discipline as the district charts: revenue sets the bar length,
order count is printed as a direct label at the end of the bar rather than riding a second axis.

Two real bugs turned up while wiring this tab in and browser-verifying it, both fixed alongside
the new charts rather than filed for later: `Reports.jsx` was fully built and linked from the
sidebar but had no matching `<Route>` in `App.jsx`, so the link 404'd; and the district charts'
own X-axis silently dropped two of the four labels on a phone-width screen until Recharts was
told `interval={0}` and given a compact "North"/"South"/"East"/"West" tick form.

## Brand identity & authentication

The Plan B Vision Eyewears mark is `<BrandLogo/>` (`src/components/brand/BrandLogo.jsx`) —
Tailwind + inline SVG, not a shipped image: a solid brand-primary card, "PLAN" and "VISION /
EYEWEARS" either side of a glasses-lens "B" (two stroked circles on a vertical spine, tangent
where the spine ends, so it reads as one glyph). Two sizes, not one scalable component: the full
lockup needs real width to read and the login page has it; the existing 56px sidebar header row
doesn't, so `compact` renders just the glasses-B mark as a small badge, with "Visionary" staying
beside it as plain text — the same layout the sidebar already had.

The brand colour is its own token, `--brand-primary` (`#577a88` light, a lightened `#6d9db0` in
dark) — deliberately not reusing `--series-1`, the app's existing chart/focus-ring accent. A
brand colour and a chart colour answer different questions; collapsing them into one token is how
a future rebrand quietly changes what a chart means. `Button.jsx`'s `primary` variant now resolves
through it, so every primary action in the app — Sign in, New voucher, Collect payment — picked up
the brand colour from one change, with no page-by-page edits.

**Authentication was already real, not a stub to build from scratch.** `AuthContext.jsx` already
ran `onAuthStateChanged`/`signOut` against Firebase Auth whenever a project is configured
(`isDemoMode` false), with a demo-mode fallback (a mock roster + role switcher) for review without
credentials; `Login.jsx` already called `signInWithEmailAndPassword`. What was missing was the
brand's visual language on that screen, clean per-error-code messages instead of one generic
string, a visible focus state on the inputs (the old ones had `outline-none` and nothing to
replace it — a real accessibility gap, fixed here), and a `<ProtectedRoute>` making the gate an
explicit routing concern rather than one `if (!user)` check at the top of `App()`.

**`ProtectedRoute` wraps the whole module tree once, not each route individually.** Every ERP page
already lived under one `<AuthedApp/>`; wrapping that once means a route added later can't forget
the check the way a tenth copy-pasted `<ProtectedRoute><Page/></ProtectedRoute>` line eventually
would. It redirects to `/login` with the attempted location in router state, and `Login.jsx`
redirects back to it on success — a deep link like `/vouchers/new` survives the detour instead of
always dropping a visitor at `/`.

**Firebase Auth error codes are translated, not shown raw**, and deliberately don't distinguish
"no such account" from "wrong password" — Firebase's own `auth/invalid-credential` already
collapses those two so a login screen can't be used to enumerate which emails have accounts;
`loginErrorMessage()` preserves that. `auth/invalid-email` stays specific, since that's a format
check, not an account lookup.

**Google is a second sign-in method on the same session, not a separate account system.**
`signInWithPopup(auth, new GoogleAuthProvider())` lands in the exact same `onAuthStateChanged`
listener `AuthContext.jsx` already had — there was no branch to add for "how did this session get
signed in." A cancelled popup (`auth/popup-closed-by-user`, `auth/cancelled-popup-request`) shows
no error at all; declining to continue isn't a mistake to alarm someone over. Google sign-in
still needs to be turned on for the provider in that Firebase project's console before it will
succeed for real — the code has nothing further to configure.

**A blocked or unavailable popup falls back to a redirect automatically**, instead of just
failing. `signInWithPopup` doesn't only get rejected when a browser's own popup blocker fires;
`auth/operation-not-supported-in-this-environment` and `auth/web-storage-unsupported` are the same
underlying problem — nowhere for the popup to run — and get the same fallback:
`isPopupUnavailable()` in `Login.jsx` catches all three and retries with
`signInWithRedirect(auth, googleProvider)`, whose result is picked up on the next page load by a
`getRedirectResult(auth)` call on mount. This matters specifically for a claude.ai Artifact
preview: Google's OAuth popup refuses to run inside a cross-origin iframe at all, which is exactly
how a preview link renders, so the redirect path is what makes Google sign-in reachable there —
though a redirect back still lands on the iframe's own URL, not the top-level page, so a full
round trip still needs the standalone deployed app, not the embedded preview, to actually finish.
Two more error codes get specific copy for the same reason `operation-not-allowed` already did —
`auth/unauthorized-domain` and `auth/network-request-failed` are configuration or connectivity
problems no retry fixes, so they say so instead of the generic "try again."

## Light & dark mode

`ThemeContext.jsx` adds a manual override on top of theming that already existed —
`src/index.css` has always defined light tokens on bare `:root` and a dark set both under
`prefers-color-scheme: dark` and under an explicit `:root[data-theme='dark']`, precisely so an
override could win in either direction later. Nothing ever set `data-theme` until now; every
screen simply followed the OS.

**The override stays off until the first click.** `ThemeContext`'s `theme` value is
`override ?? (systemPrefersDark() ? 'dark' : 'light')` — so a visitor who never touches the
toggle keeps following their OS setting live, exactly as before, including a change to it made
while the app is open. The moment `setTheme`/`toggleTheme` is called once, `override` becomes
sticky and is persisted to `localStorage['visionary.theme']`, surviving reloads until changed
again.

**`<ThemeToggle/>`** (`src/components/layout/ThemeToggle.jsx`) is deliberately the same
pill-group shape as the existing `<LanguageToggle/>` — both options always visible,
`aria-pressed` marking the active one — rather than a single icon that flips meaning on click,
so the current state is always readable at a glance, not just after the fact. It sits beside the
language toggle in three places: the persistent header, the mobile drawer, and the login page,
since theme (like language) is a choice that shouldn't require navigating past what it's about
to change.

## Shops & townships

The shop directory itself, not its analytics — Reports' Shops & townships tab already answers
"how are districts and townships performing" with charts; this module answers "who is this shop,
what have they bought, and what are their terms." Building both on the same charts would answer
the same question twice.

**Purchase history is a rebuild, not a stored list.** `shopPurchaseHistory()`
(`src/domain/shopPurchaseHistory.js`) flattens a shop's own vouchers into one row per sold line —
date, model, colour, qty, amount — the moment the profile opens; nothing is cached on the shop
document. A voided voucher never happened, so it's excluded, the same rule `profit.js` applies to
revenue; consignment stays in, tagged, since sample stock did leave the warehouse even though it
isn't revenue yet.

**The shop document's own `stats.lifetimeSales`/`voucherCount` are a query hint, never trusted
here** — the seeded demo data ships every shop with both at zero, which is exactly the failure
mode of trusting a cached rollup instead of deriving one. `useShopsData.js` computes real
per-shop totals from the same voucher window Reports.jsx uses, the "derive, don't duplicate" rule
this app applies everywhere else.

**Editing follows firestore.rules, not a simpler UI-only guess.** Price tier and credit limit are
open while *creating* a shop (the rules only fence `credit.override`, and only on update) but
restricted on an *existing* shop to admin, accountant, or that shop's own rep —
`lib/constants.js#PERMISSIONS` had no entry for either case before this pass (only
`shop:read:own`/`shop:create` existed for SALES, nothing for ACCOUNTANT at all), a real gap
between what the rules already allowed and what the UI could check.

**Township grouping is a grouped list, deliberately not a second Recharts dashboard.** Each shop
row already carries its derived district from `useShopsData.js`; the district filter and the
per-township headers use it directly. A phone gets a card list, not a table scrolled sideways —
the same pattern `CollectionTable.jsx` already uses for the same underlying problem (a list of
shops, one line of stats each, on a narrow screen).

---

## Design notes

Charts and status colours come from a validated palette: categorical hues are assigned in a
fixed order and checked for colour-vision separation, and the four status colours
(good/warning/serious/critical) are reserved — they never double as a series colour. Every
status is paired with an icon and a word, so nothing depends on colour alone. Light and dark
are both explicit token sets in `src/index.css`; components carry no `dark:` variants.

The same palette drives Recharts too (`src/components/charts/rechartsTheme.js`): every colour
handed to a `<Bar>`/`<Pie>`/`<Cell>` is a CSS custom-property string, e.g. `'var(--status-good)'`,
which SVG resolves exactly like any other presentation attribute. A Recharts chart repaints on
the light/dark toggle with no theme prop threaded through and no chart-specific dark-mode branch
to keep in sync with the hand-rolled charts beside it.
