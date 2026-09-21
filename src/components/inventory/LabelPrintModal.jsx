import { useMemo, useState } from 'react';
import { Printer, QrCode, ScanBarcode, Tag } from 'lucide-react';
import { buildLabelRun, expandLabels } from '../../domain/inventory';
import { PRICE_TIERS } from '../../lib/constants';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { LABEL_SIZES, LabelSheet } from './LabelSheet';

const CODE_TYPES = [
  { key: 'barcode', label: 'Barcode', icon: ScanBarcode },
  { key: 'qr', label: 'QR', icon: QrCode },
  { key: 'both', label: 'Both', icon: Tag },
];

/**
 * Label run setup. The preview is the real sheet at real size — not a
 * representation of it — so what a warehouse hand approves is what the printer
 * produces.
 */
export function LabelPrintModal({ open, selection, locationId, onClose }) {
  const [sizeKey, setSizeKey] = useState('MEDIUM');
  const [codeType, setCodeType] = useState('barcode');
  const [priceTier, setPriceTier] = useState('STANDARD');
  const [showPrice, setShowPrice] = useState(true);
  const [mode, setMode] = useState('PER_UNIT');
  const [fixedCopies, setFixedCopies] = useState('1');

  const size = LABEL_SIZES[sizeKey];

  const run = useMemo(
    () =>
      buildLabelRun(selection, {
        locationId,
        copies: mode === 'PER_UNIT' ? undefined : Math.max(0, Number(fixedCopies) || 0),
      }),
    [selection, locationId, mode, fixedCopies],
  );

  const labels = useMemo(() => expandLabels(run), [run]);
  const total = labels.length;

  // A preview of two thousand labels would lock the tab; the count is what
  // matters and the printer gets the full run.
  const PREVIEW_CAP = 24;
  const preview = labels.slice(0, PREVIEW_CAP);

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="max-w-3xl"
      title="Print labels"
      subtitle={`${selection.length} colour${selection.length === 1 ? '' : 's'} selected · ${total} label${total === 1 ? '' : 's'}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" icon={Printer} disabled={total === 0} onClick={() => window.print()}>
            Print {total} label{total === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      {/* Label stock is cut to size, so the sheet prints with no page margin. */}
      <style>{'@media print { @page { size: A4; margin: 6mm; } }'}</style>

      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Label size" htmlFor="label-size">
            <select
              id="label-size"
              value={sizeKey}
              onChange={(e) => setSizeKey(e.target.value)}
              className="h-9 w-full rounded-md border border-line-hair bg-surface px-2 text-sm text-ink outline-none"
            >
              {Object.values(LABEL_SIZES).map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Code">
            <div
              role="group"
              aria-labelledby="Code-group-label"
              className="flex gap-1 rounded-md border border-line-hair p-0.5"
            >
              {CODE_TYPES.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setCodeType(option.key)}
                  aria-pressed={codeType === option.key}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium transition ${
                    codeType === option.key ? 'bg-ink text-plane' : 'text-ink-secondary hover:bg-raised'
                  }`}
                >
                  <option.icon size={13} aria-hidden="true" />
                  {option.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Price shown" htmlFor="label-price-tier">
            <div className="flex gap-1.5">
              <select
                id="label-price-tier"
                value={priceTier}
                onChange={(e) => setPriceTier(e.target.value)}
                disabled={!showPrice}
                className="h-9 min-w-0 flex-1 rounded-md border border-line-hair bg-surface px-2 text-sm text-ink outline-none disabled:opacity-50"
              >
                {Object.values(PRICE_TIERS).map((tier) => (
                  <option key={tier.key} value={tier.key}>
                    {tier.label}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 text-xs text-ink-secondary">
                <input
                  type="checkbox"
                  checked={showPrice}
                  onChange={(e) => setShowPrice(e.target.checked)}
                  className="h-3.5 w-3.5"
                />
                Show
              </label>
            </div>
          </Field>

          <Field label="How many" htmlFor="label-copies-mode">
            <div className="flex gap-1.5">
              <select
                id="label-copies-mode"
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                className="h-9 min-w-0 flex-1 rounded-md border border-line-hair bg-surface px-2 text-sm text-ink outline-none"
              >
                <option value="PER_UNIT">One per unit in stock</option>
                <option value="FIXED">Fixed number each</option>
              </select>
              {mode === 'FIXED' ? (
                <input
                  inputMode="numeric"
                  value={fixedCopies}
                  onChange={(e) => setFixedCopies(e.target.value)}
                  aria-label="Copies per colour"
                  className="h-9 w-16 rounded-md border border-line-hair bg-surface px-2 text-center text-sm tabular-nums text-ink outline-none"
                />
              ) : null}
            </div>
          </Field>
        </div>

        {total === 0 ? (
          <p className="rounded-card border border-line-hair bg-raised px-3 py-6 text-center text-xs text-ink-secondary">
            Nothing to print — the selected colours have no stock at this location. Switch to a
            fixed number of copies to pre-print labels for an incoming delivery.
          </p>
        ) : (
          <div>
            <p className="mb-2 text-xs text-ink-secondary">
              Preview at actual size
              {total > PREVIEW_CAP ? ` — showing ${PREVIEW_CAP} of ${total}` : ''}
            </p>
            <div className="max-h-80 overflow-auto rounded-card border border-line-hair bg-white p-2">
              <LabelSheet
                labels={preview}
                size={size}
                codeType={codeType}
                priceTier={priceTier}
                showPrice={showPrice}
              />
            </div>
          </div>
        )}
      </div>

      {/* The full run, printed. */}
      <div className="print-region hidden print:block">
        <LabelSheet
          labels={labels}
          size={size}
          codeType={codeType}
          priceTier={priceTier}
          showPrice={showPrice}
        />
      </div>
    </Modal>
  );
}

function Field({ label, htmlFor, children }) {
  return (
    <div>
      {htmlFor ? (
        <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-ink">
          {label}
        </label>
      ) : (
        // A group of buttons has no single control to point at, so the name
        // goes on the group instead.
        <p className="mb-1 text-xs font-medium text-ink" id={`${label}-group-label`}>
          {label}
        </p>
      )}
      {children}
    </div>
  );
}
