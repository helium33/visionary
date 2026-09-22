# Firestore schema — Visionary wholesale eyewear ERP

Yangon-specific constraints shaped every decision below:

| Constraint | Consequence in the schema |
|---|---|
| Reps sell from a bag in market streets with no signal | Every write path must work against the local cache alone — **no transactions, no server counters, no Cloud Function in the critical path** |
| The 14-day term is the business's main risk control | Credit status is **derived**, never stored as the authority (see §2) |
| Frames come as model × colour matrices | Variants are a **subcollection**, not an array (see §4) |
| Four roles with sharply different access | Documents carry the fields the rules need (`salesRepId`, `township`) so rules stay cheap |

---

## 1. Design principles

### 1.1 Denormalise for the query, keep one writer per field

Firestore has no joins, so `shopName`, `township` and `salesRepId` are copied onto every
voucher. This lets the credit and township screens run **one** query instead of N+1 reads —
and, critically, it means the offline cache holds everything those screens need.

The rule that keeps denormalised copies honest: **each field has exactly one writer.**
`vouchers.balanceDue` is written only by the payment batch; `shops.credit.*` is written only
by the roll-up (client-optimistic, Cloud-Function-authoritative). Nothing else touches them.

### 1.2 Cached aggregates are hints, never authority

`shops/{id}.credit` holds a roll-up so list views and queries are fast. **No gating decision
reads it.** Section 2 explains why.

### 1.3 Document IDs are generated on the device

A shared counter document needs a transaction, and **transactions cannot run offline** —
Firestore rejects them without a server round-trip. So identifiers are device-local:

```
voucherNo:  VN-{repCode}{yyMMdd}-{base36 random}    e.g. VN-ZM260921-K4T9
receiptNo:  RC-{repCode}{yyMMdd}-{base36 random}
docId:      Firestore auto-ID (collision-free by construction)
```

`voucherNo` is for humans (it is printed and read aloud on the phone); `docId` is for the
database. A nightly Cloud Function can assign a gapless accounting sequence afterwards if the
tax position ever requires one — that job is allowed to be online-only because nothing blocks
on it.

### 1.4 Money is stored as a whole-number of kyat

MMK has no practical sub-unit. Every amount is an integer; nothing is a float, so no rounding
drift accumulates across partial payments.

### 1.5 Dates

Written with `serverTimestamp()` where accuracy matters and the write is online. Because an
offline write leaves that field `null` until it syncs, **every document that can be created
offline also carries a `clientAt` ISO string**, and `lib/dates.js#toDate` tolerates
`Timestamp | Date | string | null`. This is the single most common cause of offline crashes.

---

## 2. The 14-day credit model

### 2.1 Why status is derived rather than stored

A shop that is `ACTIVE` at 08:00 is `LOCKED` at 00:01 the next morning **with no document
having changed**. Time passed; that is all. So:

> **`shops/{id}.credit.status` is a cache for querying and reporting.
> The lock the UI enforces is recomputed from `vouchers.dueDate` against the current date,
> every render.**

`src/domain/credit.js` is the only implementation, it is pure, and it takes `today` as an
argument. The dashboard, the voucher gate and the Cloud Function that refreshes the cache all
call it, so they cannot disagree. Unit tests in `src/domain/credit.test.js` pin every boundary
(day 11 / 12 / 14 / 15 / 22).

### 2.2 State machine

```
             issue voucher                 day 12 of 14              day 15+
  (none) ──────────────────▶ ACTIVE ──────────────────▶ WATCH ──────────────────▶ LOCKED
                               ▲                          │                          │
                               └──────────────────────────┴──────────────────────────┘
                                        payment clears the oldest voucher
                                                    │
                                                    ▼
                                      admin override (30 min, server-verified)
                                          temporarily bypasses LOCKED
```

`OVERDUE` exists as a distinct state between `WATCH` and `LOCKED` for businesses that run a
grace period; with `GRACE_DAYS = 0` a shop moves straight to `LOCKED`.

### 2.3 Where the lock is enforced

| Layer | Enforcement | Bypassable? |
|---|---|---|
| UI | `canIssueVoucher()` disables the voucher button and explains why | Yes — it's a browser |
| Firestore rules | A voucher write is rejected when `shops/{id}.credit.lockedUntilPaid == true` and no live override exists | No, but the cached flag can lag |
| Cloud Function `onVoucherWrite` | Recomputes ageing server-side and voids a voucher issued against a locked shop | No — authoritative |

Three layers because the first is convenience, the second is cheap, and only the third sees
the true clock. A rep who is offline **can** write a voucher for a shop that locked while they
were out of signal; it syncs, the function catches it, voids it and writes an audit entry.
That is the correct trade-off: a rep in a market street must never be blocked by a network,
and the business would rather reverse one voucher than lose a day of selling.

### 2.4 The override

Verified by a Cloud Function (`grantCreditOverride`), never in the browser: a client-side
check would ship the hash in the bundle. Rules deny `credit.override` to every client, so only
the server can write it. It is therefore **online-only by design** — releasing a shop past its
term is an owner's decision, not something to self-serve from a phone. It expires in 30
minutes so it cannot leak into next week's orders.

---

## 3. Collections

### `users/{uid}`

The `active` flag is how an account is disabled — a user document is never deleted, the same
"deactivate instead" convention as shops and everything else with history attached to it. A role
change or a deactivation writes only this document; the custom auth claim Firestore rules
actually read is mirrored onto the account by a Cloud Function trigger on this write, never set
by a client (see §2.4's override for why that separation matters — the same reasoning applies
here: a signed-in session must never be able to grant itself a claim by writing a document).

```js
{
  name: 'Ko Zin Min',
  email: 'zin@visionary.mm',
  role: 'ADMIN' | 'SALES' | 'ACCOUNTANT' | 'WAREHOUSE',
  repCode: 'ZM',                  // 2 chars — prefixes voucher/receipt numbers
  townships: ['Latha', 'Pabedan'],// SALES only: the rep's patch
  carStockLocationId: 'LOC-CAR-ZM',
  commissionRatePct: 2.5,
  active: true,
  createdAt, updatedAt
}
```

`role` is mirrored into a **custom auth claim** by a Cloud Function. Rules read the claim
(free, in the token); the UI reads the document. The claim is the security boundary.

### `shops/{shopId}`

```js
{
  code: 'SH-001',
  name: 'Shwe Myint Optical',
  nameMM: 'ရွှေမြင့်မျက်မှန်ဆိုင်',
  township: 'Latha',              // indexed — township analytics + rules
  // No `district` field: it's derived at read time from `township` via
  // getDistrictForTownship() (src/constants/districts.js), never stored —
  // the same "compute it, don't duplicate it" rule credit status and dead
  // stock already follow. A shop's township can never silently disagree
  // with its district, because there is only one place that fact lives.
  ownerName, phone, viber, address, location: GeoPoint,

  priceTier: 'STANDARD' | 'BULK' | 'BULK_PLUS' | 'VIP',
  creditLimit: 4500000,           // 0 = no limit
  creditTermDays: 14,             // per-shop override of the default term
  salesRepId: 'u-sales-1',        // indexed — a rep sees only their own shops
  active: true,

  // ---- CACHED ROLL-UP. A hint for queries; never the authority (§2.1) ----
  credit: {
    outstanding: 2100000,
    overdueAmount: 400000,
    onAccountCredit: 0,           // overpayment held against future vouchers
    oldestUnpaidDueDate: Timestamp,
    oldestUnpaidVoucherNo: 'VN-02615',
    status: 'LOCKED',             // for `where('credit.status','==','LOCKED')` only
    lockedUntilPaid: true,        // the flag the security rules read
    manualHold: false,            // accountant hold, independent of ageing
    manualHoldReason: null,
    override: {                   // SERVER-WRITTEN ONLY
      grantedBy: 'u-admin', grantedAt: Timestamp,
      expiresAt: Timestamp, reason: 'KBZPay transfer not yet cleared'
    } | null,
    lastPaymentAt: Timestamp,
    recalcAt: Timestamp
  },

  stats: { lifetimeSales, voucherCount, avgDaysToPay, lastPurchaseAt }
}
```

### `shops/{shopId}/ledger/{entryId}` *(subcollection)*

Append-only running account — the document a shop owner argues with you about.

```js
{
  at: Timestamp,
  type: 'VOUCHER' | 'PAYMENT' | 'CREDIT_NOTE' | 'OPENING_BALANCE',
  refId, refNo,
  debit: 1850000, credit: 0,
  balanceAfter: 2100000,
  note
}
```

A subcollection rather than a top-level collection because it is **always** read for exactly
one shop, so it keeps the offline cache small and the rules trivially scoped.

### `vouchers/{voucherId}` — the central document

```js
{
  voucherNo: 'VN-ZM260921-K4T9',
  shopId, shopName, township,     // denormalised (§1.1)
  salesRepId,
  type: 'SALE' | 'CONSIGNMENT',   // CONSIGNMENT carries no debt until converted
  status: 'DRAFT' | 'ISSUED' | 'PARTIAL' | 'PAID' | 'VOID' | 'CONSIGNED',

  issueDate: Timestamp,
  termDays: 14,
  dueDate: Timestamp,             // = issueDate + termDays, computed AT CREATION
                                  // so ageing needs no second read

  items: [{
    productId, modelNo: 'PB-2026',
    colorCode: 'C1', colorName: 'Black',
    qty: 10, unitPrice: 18000, lineTotal: 180000,
    tierApplied: 'BULK', discountPct: 5,
    // COST IS FROZEN HERE, not looked up on the product later. The next
    // shipment lands at a different landed cost; history must not move with
    // it. `bundleUnitCost` is the case + cloth that ship free with the frame —
    // no revenue, real cost.
    unitCost: 10450, bundleUnitCost: 827,
    bundled: { case: 10, cloth: 10 }   // auto-bundling record (§4.3)
  }],

  subtotal, discount, discountReason, grandTotal,
  paidAmount, balanceDue,         // balanceDue is the field the credit engine reads

  previousBalance,                // printed on the invoice
  paymentAtIssue,
  newBalance,

  createdBy, createdAt, updatedAt,
  issuedOffline: true,            // set when navigator.onLine was false
  clientAt: '2026-09-21T09:14:22.000Z',
  overrideRef: 'ovr_abc123' | null,   // set when issued against a LOCKED shop
  voidedBy, voidedAt, voidReason
}
```

`dueDate` is **stored, not computed at read time**, so the ageing query
(`where('status','in',[...]).orderBy('dueDate')`) is a single indexed range scan that works
identically against the offline cache.

### `payments/{paymentId}`

```js
{
  receiptNo: 'RC-ZM260921-P2M8',
  shopId, shopName, township,
  amount, appliedAmount, unappliedAmount,   // unapplied = on-account credit
  method: 'CASH'|'KBZ_PAY'|'WAVE_PAY'|'AYA_PAY'|'BANK_TRANSFER'|'CHEQUE',

  // FIFO allocation, computed client-side and stored with the payment so the
  // receipt can be reprinted exactly as it was issued.
  allocations: [{ voucherId, voucherNo, amount, balanceAfter, daysOverdue }],

  onTime: true,                   // every allocation had daysOverdue === 0
                                  // → feeds the rep's fast-collection bonus
  receivedAt, receivedBy, receivedByName, note
}
```

Written together with the touched vouchers and the shop roll-up in **one `writeBatch`** — a
batch is atomic *and* queues offline as a single unit, so the ledger can never be
half-applied.

### `creditNotes/{noteId}`

```js
{
  shopId, amount,
  reason: 'RETURN_DEFECTIVE' | 'PRICE_ADJUSTMENT' | 'GOODWILL',
  sourceVoucherId,                // returns settle against their own voucher first
  items: [{ productId, colorCode, qty }],   // moved to the Damaged bucket
  allocations: [...],             // same shape as payments
  issuedAt, issuedBy
}
```

### `products/{productId}` + `products/{productId}/variants/{colorCode}` — the matrix

```js
// products/{productId}
{
  modelNo: 'PB-2026',
  brand: 'Polar Brite',
  category: 'FRAME' | 'CASE' | 'CLOTH' | 'ACCESSORY',
  material: 'TR90' | 'ACETATE' | 'METAL' | 'TITANIUM',
  shape: 'RECTANGLE' | 'ROUND' | 'CAT_EYE' | 'AVIATOR' | 'SQUARE',
  gender: 'UNISEX' | 'MEN' | 'WOMEN' | 'KIDS',
  size: { lens: 52, bridge: 18, temple: 140 },

  pricing: { STANDARD: 18000, BULK: 17100, BULK_PLUS: 16560, VIP: 15840 },
  costing: {                      // landed cost (§6 of the brief)
    factoryPrice: 9200, cargo: 800, transport: 300, labeling: 150,
    actualCost: 10450,            // = sum above, recomputed on PO receipt
    lastPoId: 'PO-2026-014'
  },

  bundle: { caseProductId: 'P-CASE-STD', clothProductId: 'P-CLOTH-STD' },
  colorCount: 5,                  // denormalised for grid rendering
  totalStock: 148,                // denormalised sum of variants
  lastSoldAt: Timestamp,          // powers the dead-stock (>3 months) report
  active: true
}

// products/{productId}/variants/{colorCode}
{
  colorCode: 'C1',
  colorName: 'Black',
  hex: '#101010',
  barcode: '8850001234561',       // EAN-13, printed on the label
  stock: {
    'LOC-MAIN': 42,
    'LOC-CAR-ZM': 6,              // a rep's bag stock
    'LOC-DAMAGED': 2
  },
  reserved: 4,                    // on unconfirmed/draft vouchers
  reorderPoint: 10,               // low-stock alert threshold
  lastCountedAt
}
```

**Why a subcollection and not an array of colours?** Three reasons:

1. A frame model routinely carries 5–12 colours; stock on each changes independently. An array
   means every colour's stock write rewrites the whole product document, and two reps selling
   different colours of the same model overwrite each other.
2. `increment()` works on a field in its own document — the only safe way to decrement stock
   from several devices at once, and the only one that survives offline replay.
3. Grid Fast Entry reads one model's variants (`collection(products/{id}/variants)`) — a single
   small query that caches cleanly.

`stock` is a **map keyed by location** rather than one document per location, because a stock
figure is only ever read together with its siblings ("where is this colour?").

**Two read patterns, deliberately different.** The voucher screen fetches variants *per model* —
it touches three models, so pulling 240 documents would be waste. The inventory screen is the
opposite: stock totals, low-stock counts and dead-stock capital are all sums across the whole
matrix, so lazy loading would report zero until someone happened to open each model. It uses a
**collection-group query** on `variants`, regrouping by parent product id from each document's
reference. That query needs its own security rule and its own index — see §5 and §7; a nested
path rule does *not* authorise a collection-group read, and the automatic single-field index
only covers `COLLECTION` scope.

### `inventoryMoves/{moveId}` — the immutable stock journal

```js
{
  at, type: 'PO_RECEIPT'|'SALE'|'RETURN'|'TRANSFER'|'ADJUSTMENT'|'DAMAGE'|'CONSIGNMENT',
  productId, modelNo, colorCode,
  qty: -10,                       // signed
  fromLocationId, toLocationId,
  refType: 'VOUCHER'|'PO'|'TRANSFER'|'COUNT', refId, refNo,
  byUserId, note
}
```

Every stock figure in `variants.stock` is reconstructible by replaying this journal — which is
what the reconciliation job does when a rep's car stock does not tie out.

### `carTrips/{tripId}` — a rep's day out

```js
{
  tripNo: 'CAR-260921-ZM',
  repId, repName,
  locationId: 'LOC-CAR-ZM',       // the bag this trip moves stock through
  status: 'OPEN' | 'RECONCILING' | 'CLOSED',
  route: ['Latha', 'Pabedan'],
  openedAt, closedAt,

  openingLines: [{ productId, modelNo, colorCode, qty }],  // leftover from yesterday
  loadLines:    [{ productId, modelNo, colorCode, qty }],  // appended on each load
  countedLines: [{ productId, modelNo, colorCode, qty }],  // the physical count

  cash: { expected, counted, variance, note },
  summary: { pieces, shortPieces, shortValue, cashVariance, creditIssued },
  stockReturned: true,
  reconciledBy
}
```

**Why the trip stores its own movements** instead of reading the live stock field: the
reconciliation has to explain itself. "You took 12, sold 8, so you should have 4" is an argument a
rep can check standing at the counter; "the system says 4" is not, and a reconciliation nobody
trusts gets signed without counting. It also works offline, where the live figure may be
mid-sync.

`sold` is never stored — it is derived from the vouchers whose `locationId` is this bag and whose
`issueDate` falls inside the trip. That is why `vouchers.locationId` exists.

### `stockLocations/{locationId}`

```js
{ code: 'LOC-CAR-ZM', name: 'Ko Zin — car stock', type: 'MAIN'|'CAR'|'DAMAGED'|'CONSIGNMENT',
  assignedUserId, active }
```

### `purchaseOrders/{poId}`

```js
{
  poNo, supplier: { name, country: 'CN', contact },
  status: 'DRAFT'|'ORDERED'|'IN_TRANSIT'|'RECEIVED'|'CLOSED',
  orderedAt, expectedAt, receivedAt,
  lines: [{ productId, modelNo, colorCode, qty, factoryUnitPrice, receivedQty }],
  charges: { cargo: 420000, transport: 85000, labeling: 60000, customs: 0 },
  allocationBasis: 'BY_VALUE' | 'BY_QTY',   // how charges spread across lines
  totals: { factory, charges, landed },
  currency: 'CNY', fxRate: 62.5
}
```

Landed cost = factory + apportioned charges, written back to `products.costing.actualCost` on
receipt. `allocationBasis` is stored because apportioning K 420,000 of cargo by value and by
quantity give materially different unit costs, and the business must be able to say which it
used.

Two details the implementation is strict about:

- **Charges balance to the kyat.** Apportioning by naive rounding loses or invents a few kyat on
  every line, and a cost base that cannot be reconciled with the shipping invoice is worse than
  no cost base. A largest-remainder split guarantees the shares sum to the charge total exactly.
- **A short delivery makes each surviving piece dearer.** At receipt the charges are spread over
  `receivedQty`, not over what was ordered: the freight invoice being typed in covers the
  shipment that actually came, so apportioning it over quantities that never turned up would
  spread real money across phantom pieces and undervalue the stock on the shelf.

### `expenses/{expenseId}`

```js
{ date, category: 'SALARY'|'OFFICE'|'TRANSPORT'|'FEES'|'RENT'|'OTHER',
  amount, description, paidBy, attachmentUrl }
```

Net profit = Σ `vouchers.grandTotal` (type SALE) − Σ landed cost of items sold − Σ `expenses.amount`.

### `auditLogs/{logId}` — append-only

```js
{ actorId, actorName, actorRole,
  action: 'VOUCHER_EDIT'|'VOUCHER_VOID'|'CREDIT_OVERRIDE'|'PAYMENT_RECORD'|'PRICE_CHANGE'|
          'STOCK_ADJUSTMENT'|'CREDIT_HOLD_SET',
  entity, entityId, before, after, reason,
  at: serverTimestamp, clientAt: ISO string }
```

Rules allow `create` and **deny `update` and `delete` to everyone, admins included** — an audit
log an admin can rewrite is not an audit log.

### `settings/config` *(single document)*

`masterPasswordHash` is rotated by a callable (`rotateMasterPassword`), not by a document write —
the collection denies client reads and writes outright (`allow read, write: if false`), so
neither the hash nor the ability to change it ever reaches the browser. Rotating it requires the
*current* password, not just an admin session, so a desk left unlocked cannot be used to lock
every other admin out.

```js
{ creditTermDays: 14, approachingDay: 12, graceDays: 0, overrideValidMinutes: 30,
  masterPasswordHash,             // bcrypt — readable by NOBODY; the callable reads it
  tiers: { BULK: { minQty: 10, discountPct: 5 }, BULK_PLUS: { minQty: 50, discountPct: 8 } },
  deadStockDays: 90, lowStockDefault: 10,
  company: { name, address, phone, viber } }
```

`masterPasswordHash` lives in a document no client can read (`allow read: if false`). The
callable function reads it with admin credentials.

### `dailyRollups/{yyyy-MM-dd}`

Pre-aggregated totals (sales, collections, by township, by rep) written nightly. Reporting over
months of history reads ~90 small documents instead of thousands of vouchers — and the credit
screens stay on live vouchers, because a rolled-up figure cannot be aged.

---

## 4. How the brief's features map onto this schema

| Requirement | Mechanism |
|---|---|
| Township analytics | `vouchers.township` denormalised + `shops.township` indexed |
| District rollups (Shops & townships report) | No new field — `district` is never stored, always `getDistrictForTownship(vouchers.township)` (`src/constants/districts.js`), computed at read time in `src/domain/townshipAnalytics.js` |
| Shop purchase history | `vouchers where shopId == X orderBy issueDate desc` |
| 14-day due date | `vouchers.dueDate` written at creation |
| Automated lock | Derived by `evaluateShopCredit()`; cached in `shops.credit.lockedUntilPaid`; enforced in rules + function |
| Master-password release | `shops.credit.override`, server-written only, 30-minute expiry |
| 12-day warning | `ageVoucher().isApproaching` — day ≥ 12 of 14 |
| Partial payment, oldest first | `allocatePayment()` FIFO, stored in `payments.allocations` |
| Matrix inventory | `products` + `variants/{colorCode}` subcollection |
| Grid fast entry | One read of a model's `variants`, one batched voucher write |
| Barcode labels | `variants.barcode` (EAN-13, check digit computed) + `products.pricing[tier]` |
| Auto-bundling | `products.bundle` → extra `inventoryMoves` on each SALE |
| Tiered pricing | `products.pricing` map × `shops.priceTier` × line-qty thresholds in `settings.tiers` |
| Consignment | `vouchers.type = 'CONSIGNMENT'` — excluded from receivables *and* revenue |
| Defective returns | `creditNotes` + `inventoryMoves` into `LOC-DAMAGED` |
| Rep commission | `vouchers.salesRepId` (volume) + `payments.onTime` (collection bonus) |
| Net profit | `vouchers.items[].unitCost` (frozen COGS) − `expenses` in window |
| Landed cost | `purchaseOrders.charges` → `products.costing.actualCost` |
| Dead stock | `products.lastSoldAt` vs today, derived at read time — bands at 60 / 90 / 180 days |
| Car stock | `stockLocations` type `CAR` + `variants.stock['LOC-CAR-*']` |
| Trip reconciliation | `carTrips` (took/counted) + `vouchers.locationId` (sold) + `payments.method` (cash vs phone) |
| Offline | `persistentLocalCache`, device-generated IDs, batched writes, derived status |
| Audit log | `auditLogs`, create-only — every service module writes to it; `src/domain/audit.js` reads it back |
| Role assignment | `users/{uid}.role`, mirrored into a custom claim server-side |

---

## 5. Indexes

```
vouchers:  status ASC, dueDate ASC                 ← the ageing query
vouchers:  shopId ASC, issueDate DESC              ← shop purchase history
vouchers:  salesRepId ASC, issueDate DESC          ← a rep's own vouchers
vouchers:  township ASC, issueDate DESC            ← township analytics
vouchers:  type ASC, status ASC, dueDate ASC       ← open receivables excluding consignment
payments:  shopId ASC, receivedAt DESC
payments:  receivedBy ASC, receivedAt DESC         ← commission runs
shops:     salesRepId ASC, credit.status ASC       ← "my locked shops"
shops:     township ASC, name ASC
inventoryMoves: productId ASC, at DESC
auditLogs: entityId ASC, at DESC
products:  active ASC, modelNo ASC                 ← the inventory list
products:  active ASC, category ASC, modelNo ASC   ← … filtered by category
carTrips:  repId ASC, openedAt DESC                ← a rep's own trips

fieldOverride: variants.colorCode ASC at COLLECTION_GROUP scope   ← the inventory matrix
```

Shipped in `firestore.indexes.json`.

---

## 6. Offline behaviour, end to end

```
Rep taps "Issue voucher" with no signal
      │
      ├─ canIssueVoucher() runs against the LOCAL cache → allowed / blocked, instantly
      ├─ writeBatch(): voucher + variant stock decrements + shop roll-up
      ├─ Firestore resolves the write from cache; the UI updates immediately
      ├─ onSnapshot fires with metadata.hasPendingWrites === true → "Syncing" badge
      │
      ▼  signal returns
      ├─ Firestore replays the mutation queue in order
      ├─ onVoucherWrite recomputes the shop's credit and the authoritative stock
      ├─ A voucher issued against a shop that locked meanwhile is voided + audited
      └─ hasPendingWrites → false → "Synced"
```

What is deliberately **not** available offline: the credit override (server-verified),
gapless accounting sequences, and PDF generation that needs server fonts.

Cache sizing: a rep's scope is roughly 40 shops × ~3 open vouchers + ~600 variants ≈ a few MB.
Firestore's default cache is 40 MB, so the whole working set is resident. Closed vouchers older
than ~120 days are never queried by the field app, which keeps it that way.

---

## 7. Security rules — shape

```
users         read: self, or admin        write: admin only (role → custom claim)
shops         read: admin/accountant; SALES only where salesRepId == uid
              write: admin; SALES may create and edit contact fields
              credit.override: NOBODY (server only)
vouchers      create: SALES/ADMIN, and only when the shop is not locked (or an override is live)
              update: admin/accountant; SALES only same-day, own voucher, DRAFT/ISSUED
              delete: nobody — void instead, so the audit trail survives
payments      create: accountant/admin/SALES(collect)    update/delete: nobody
products      read: all signed in     write: warehouse/admin
variants      read: nested (per model) AND collection-group (whole matrix, inventory screen)
              write: warehouse/admin; SALES may touch only `stock` and `reserved`
inventoryMoves create: warehouse/sales/admin             update/delete: nobody
auditLogs     create: any signed-in user                 update/delete: NOBODY
settings      read: admin only    masterPasswordHash: read: false for everyone
```

Full implementation in `firestore.rules`.
