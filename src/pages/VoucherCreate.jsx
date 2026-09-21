import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Grid3x3, Package, Receipt, Store, Truck } from 'lucide-react';
import { CREDIT_STATUS, canIssueVoucher } from '../domain/credit';
import {
  DISCOUNT_MODES,
  bundleRequirements,
  checkStock,
  priceCart,
  summariseVoucher,
} from '../domain/voucher';
import { createVoucher } from '../services/voucherService';
import { subscribeStockLocations } from '../services/dataSource';
import { fmtMMK } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { useCatalogue } from '../hooks/useCatalogue';
import { useCreditData } from '../hooks/useCreditData';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { GridFastEntry } from '../components/voucher/GridFastEntry';
import { ModelPicker } from '../components/voucher/ModelPicker';
import { CreditGate, ShopSelect } from '../components/voucher/ShopSelect';
import { VoucherLines } from '../components/voucher/VoucherLines';
import { VoucherPrint } from '../components/voucher/VoucherPrint';
import { VoucherTotals } from '../components/voucher/VoucherTotals';
import { MasterPasswordModal } from '../components/credit/MasterPasswordModal';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { SkeletonRows } from '../components/ui/EmptyState';
import { useToast } from '../components/ui/Toast';
import { PageHeader } from '../components/layout/AppShell';

/**
 * ===========================================================================
 * VOUCHER CREATION
 * ===========================================================================
 * Shop → grid entry → lines → invoice. Four things are load-bearing:
 *
 *  • THE CREDIT GATE runs on every render against freshly derived status, so a
 *    shop that crosses its 14-day term mid-order is caught before the save,
 *    not after. The gate is `canIssueVoucher` — the same function the security
 *    rules and the server-side check mirror.
 *  • PRICING IS RECOMPUTED FROM THE WHOLE CART. Adding a second colour can move
 *    the model past 10 pieces and re-rate every line of that model, which is
 *    exactly what the shop expects and what a per-line calculation gets wrong.
 *  • STOCK IS CHECKED AT ONE LOCATION. Selling from car stock must not draw on
 *    the warehouse's count.
 *  • THE SAVE IS ONE BATCH (see services/voucherService.js), so it works
 *    offline and can never half-apply.
 */
export default function VoucherCreate() {
  const { user } = useAuth();
  const toast = useToast();
  const online = useOnlineStatus();
  const { portfolio, loading: creditLoading, today } = useCreditData();
  const { products, byId, frames, ensureVariants, loading: catalogueLoading } = useCatalogue();

  const [shopId, setShopId] = useState(null);
  const [locationId, setLocationId] = useState('LOC-MAIN');
  const [locations, setLocations] = useState([]);
  const [type, setType] = useState('SALE');
  const [modelId, setModelId] = useState(null);
  const [cart, setCart] = useState([]);
  const [discount, setDiscount] = useState('');
  const [discountMode, setDiscountMode] = useState(DISCOUNT_MODES.AMOUNT);
  const [payment, setPayment] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [saving, setSaving] = useState(false);
  const [issued, setIssued] = useState(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [override, setOverride] = useState(null);

  useEffect(() => subscribeStockLocations(({ data }) => setLocations(data)), []);

  // Variants load per model: whatever is open in the grid, everything already
  // in the cart, and the case/cloth each cart model bundles — the bundled
  // accessories move stock too, so their counts have to be loaded to be
  // checked.
  useEffect(() => {
    if (modelId) ensureVariants(modelId);
    for (const line of cart) {
      ensureVariants(line.productId);
      const bundle = byId.get(line.productId)?.bundle;
      if (bundle?.caseProductId) ensureVariants(bundle.caseProductId);
      if (bundle?.clothProductId) ensureVariants(bundle.clothProductId);
    }
  }, [modelId, cart, byId, ensureVariants]);

  const row = portfolio.rows.find((r) => r.shop.id === shopId) ?? null;
  const shop = row?.shop ?? null;
  const baseState = row?.state ?? null;

  // A release granted in this session applies immediately, before the shop
  // document round-trips back through the listener.
  const state = useMemo(
    () => (baseState && override ? { ...baseState, override } : baseState),
    [baseState, override],
  );

  const lines = useMemo(
    () => priceCart(cart, { products, shopTier: shop?.priceTier ?? 'STANDARD' }),
    [cart, products, shop?.priceTier],
  );
  const bundles = useMemo(() => bundleRequirements(lines, products), [lines, products]);
  const stock = useMemo(
    () => checkStock(lines, bundles, { products, locationId }),
    [lines, bundles, products, locationId],
  );

  const totals = useMemo(
    () =>
      summariseVoucher({
        lines,
        discount,
        discountMode,
        previousBalance: state?.outstanding ?? 0,
        payment,
        issueDate: today,
        termDays: shop?.creditTermDays ?? 14,
      }),
    [lines, discount, discountMode, state?.outstanding, payment, today, shop?.creditTermDays],
  );

  const gate = useMemo(
    () =>
      state
        ? canIssueVoucher(state, { amount: totals.grandTotal, isConsignment: type === 'CONSIGNMENT' })
        : { allowed: false, requiresOverride: false, code: 'NO_SHOP', reason: null },
    [state, totals.grandTotal, type],
  );

  const addLines = (incoming) => {
    setCart((prev) => {
      const next = [...prev];
      for (const line of incoming) {
        const existing = next.findIndex(
          (l) => l.productId === line.productId && l.colorCode === line.colorCode,
        );
        if (existing >= 0) next[existing] = { ...next[existing], qty: next[existing].qty + line.qty };
        else next.push(line);
      }
      return next;
    });
    toast.push(
      `Added ${incoming.reduce((s, l) => s + l.qty, 0)} pcs of ${byId.get(incoming[0].productId)?.modelNo ?? ''}`,
      { tone: 'success', duration: 1800 },
    );
  };

  const changeQty = (line, value) => {
    const qty = Math.max(0, Math.floor(Number(value) || 0));
    setCart((prev) =>
      prev
        .map((l) =>
          l.productId === line.productId && l.colorCode === line.colorCode ? { ...l, qty } : l,
        )
        .filter((l) => l.qty > 0),
    );
  };

  const removeLine = (line) =>
    setCart((prev) =>
      prev.filter((l) => !(l.productId === line.productId && l.colorCode === line.colorCode)),
    );

  const reset = () => {
    setCart([]);
    setDiscount('');
    setPayment('');
    setModelId(null);
  };

  const onSave = async () => {
    setSaving(true);
    const result = await createVoucher({
      shop,
      lines,
      bundles,
      totals,
      type,
      locationId,
      actor: user,
      isOnline: online,
      paymentMethod,
      overrideRef: state?.override ? `override:${shop.id}` : null,
      issueDate: today,
    });
    setSaving(false);

    if (!result.ok) {
      toast.push(result.message, { tone: 'error' });
      return;
    }
    toast.push(
      `${result.voucher.voucherNo} issued · K ${fmtMMK(result.voucher.grandTotal)}` +
        (online ? '' : ' — queued offline, will sync automatically'),
      { tone: 'success' },
    );
    setIssued(result.voucher);
    setOverride(null);
    reset();
  };

  const canSave = Boolean(shop) && lines.length > 0 && gate.allowed && stock.ok && !saving;
  const selectedModel = modelId ? byId.get(modelId) : null;
  const existingQtyForModel = cart
    .filter((l) => l.productId === modelId)
    .reduce((sum, l) => sum + l.qty, 0);

  return (
    <>
      <PageHeader
        title="New voucher"
        subtitle="Grid fast entry · 14-day terms applied automatically"
        actions={
          <div className="flex gap-1 rounded-md border border-line-hair p-0.5 text-xs">
            {[
              ['SALE', 'Sale', Receipt],
              ['CONSIGNMENT', 'Consignment', Package],
            ].map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                onClick={() => setType(key)}
                aria-pressed={type === key}
                className={`flex items-center gap-1.5 rounded px-3 py-1.5 font-medium transition ${
                  type === key ? 'bg-ink text-plane' : 'text-ink-secondary hover:bg-raised'
                }`}
              >
                <Icon size={13} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Shop"
              subtitle={shop ? `${shop.township} · ${shop.ownerName}` : 'Who is this order for?'}
              icon={Store}
              action={
                <select
                  aria-label="Stock location"
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                  className="h-8 rounded border border-line-hair bg-surface px-2 text-xs text-ink-secondary"
                >
                  {locations
                    .filter((l) => l.type === 'MAIN' || l.assignedUserId === (user?.uid ?? user?.id))
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                </select>
              }
            />
            <CardBody className="space-y-3">
              {creditLoading ? (
                <SkeletonRows rows={3} />
              ) : (
                <>
                  <ShopSelect rows={portfolio.rows} selectedId={shopId} onSelect={setShopId} />
                  {shop ? (
                    <CreditGate
                      shop={shop}
                      state={state}
                      gate={gate}
                      canOverride={user?.role === 'ADMIN'}
                      onRequestOverride={() => setOverrideOpen(true)}
                    />
                  ) : null}
                </>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Grid fast entry"
              subtitle="Pick a model, then type quantities down its colour row"
              icon={Grid3x3}
            />
            <CardBody className="pb-0">
              {catalogueLoading ? (
                <SkeletonRows rows={3} />
              ) : (
                <ModelPicker products={frames} selectedId={modelId} onSelect={setModelId} />
              )}
            </CardBody>
            <div className="mt-3 border-t border-line-hair">
              <GridFastEntry
                product={selectedModel}
                shopTier={shop?.priceTier ?? 'STANDARD'}
                locationId={locationId}
                existingQty={existingQtyForModel}
                onAdd={addLines}
              />
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Voucher items"
              subtitle={
                lines.length
                  ? `${totals.lineCount} lines · ${totals.pieces} pcs`
                  : 'Nothing added yet'
              }
              icon={Receipt}
            />
            <VoucherLines
              lines={lines}
              bundles={bundles}
              onChangeQty={changeQty}
              onRemove={removeLine}
            />

            {!stock.ok ? (
              <div className="flex items-start gap-2 border-t border-line-hair bg-wash-critical px-4 py-2.5">
                <AlertTriangle
                  size={15}
                  className="mt-0.5 shrink-0 text-status-critical"
                  aria-hidden="true"
                />
                <p className="text-xs text-ink-secondary">
                  <span className="font-medium text-ink">Not enough stock here.</span>{' '}
                  {stock.shortages
                    .map((s) => `${s.label} short by ${s.short} (${s.available} on hand)`)
                    .join('; ')}
                  . Reduce the quantity or switch stock location.
                </p>
              </div>
            ) : null}

            {stock.warnings.length ? (
              <div className="flex items-start gap-2 border-t border-line-hair px-4 py-2.5">
                <Truck size={14} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden="true" />
                <p className="text-xs text-ink-secondary">
                  Bundled accessories are short:{' '}
                  {stock.warnings.map((w) => `${w.label} by ${w.short}`).join(', ')}. The frames
                  still ship — reorder the accessories.
                </p>
              </div>
            ) : null}
          </Card>
        </div>

        <div className="lg:sticky lg:top-[4.5rem] lg:self-start">
          <Card>
            <CardHeader title="Invoice" icon={Receipt} />
            <CardBody>
              <VoucherTotals
                totals={totals}
                discount={discount}
                discountMode={discountMode}
                onDiscountChange={setDiscount}
                onDiscountModeChange={setDiscountMode}
                payment={payment}
                onPaymentChange={setPayment}
                paymentMethod={paymentMethod}
                onPaymentMethodChange={setPaymentMethod}
                type={type}
                saving={saving}
                canSave={canSave}
                onSave={onSave}
              />

              {shop && !gate.allowed ? (
                <p className="mt-3 text-2xs text-status-critical">
                  Blocked: {gate.reason}
                </p>
              ) : null}
              {!shop ? (
                <p className="mt-3 text-2xs text-ink-secondary">Select a shop to issue a voucher.</p>
              ) : null}
            </CardBody>
          </Card>
        </div>
      </div>

      {shop && state ? (
        <MasterPasswordModal
          open={overrideOpen}
          shop={shop}
          state={state}
          onClose={() => setOverrideOpen(false)}
          onGranted={setOverride}
        />
      ) : null}

      <VoucherPrint
        open={Boolean(issued)}
        voucher={issued}
        shop={portfolio.rows.find((r) => r.shop.id === issued?.shopId)?.shop ?? shop}
        onClose={() => setIssued(null)}
      />
    </>
  );
}

export { CREDIT_STATUS };
