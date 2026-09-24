import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileUp, Upload } from 'lucide-react';
import { modelKey, parseStockImport, planStockImport } from '../../domain/stockImport';
import { importStock } from '../../services/stockImportService';
import { fmtMMK } from '../../lib/format';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

const MAIN_LOCATION = 'LOC-MAIN';
const inputClass =
  'h-8 w-28 rounded border border-line-hair bg-surface px-2 text-xs tabular-nums text-ink outline-none focus:border-brand-primary';

/**
 * Opening stock from a CSV export. Nothing is written until the preview has
 * been read: the counts, what was merged, what was skipped, and every model
 * held back for a figure that looks like a typing slip.
 */
export function StockImportModal({ open, onClose, products = [], locations = [], defaultLocationId }) {
  const { user } = useAuth();
  const { t } = useLocale();
  const online = useOnlineStatus();

  const [file, setFile] = useState(null); // { name, parsed }
  const [locationId, setLocationId] = useState(defaultLocationId ?? MAIN_LOCATION);
  const [includeEmpty, setIncludeEmpty] = useState(false);
  const [overrides, setOverrides] = useState({});
  const [phase, setPhase] = useState('pick'); // pick | importing | done
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState(null);

  const existing = useMemo(
    () => ({
      keys: new Set(products.map((p) => modelKey(p.modelNo, p.brand, p.size?.lens ?? null))),
      ids: new Set(products.map((p) => p.id)),
      barcodes: products.flatMap((p) => (p.variants ?? []).map((v) => v.barcode)),
    }),
    [products],
  );

  const parsed = file?.parsed;
  const plan = useMemo(
    () =>
      parsed?.ok
        ? planStockImport(parsed, {
            existingKeys: existing.keys,
            existingIds: existing.ids,
            includeEmpty,
            overrides,
          })
        : null,
    [parsed, existing, includeEmpty, overrides],
  );

  // The attention list is fixed by what the FILE said, so a model does not
  // jump out of view the moment its price is corrected.
  const skippedKeys = useMemo(
    () => new Set([...(plan?.skipped.existing ?? []), ...(plan?.skipped.empty ?? [])].map((m) => m.key)),
    [plan],
  );
  const flagged = useMemo(
    () => (parsed?.ok ? parsed.models.filter((m) => m.issues.length && !skippedKeys.has(m.key)) : []),
    [parsed, skippedKeys],
  );
  const readyKeys = useMemo(() => new Set(plan?.ready.map((m) => m.key)), [plan]);
  const planned = useMemo(
    () => new Map([...(plan?.ready ?? []), ...(plan?.needsAttention ?? []), ...(plan?.skipped.excluded ?? [])].map((m) => [m.key, m])),
    [plan],
  );
  const clean = useMemo(
    () => (parsed?.ok ? parsed.models.filter((m) => !m.issues.length && planned.has(m.key)) : []),
    [parsed, planned],
  );

  if (!open) return null;

  const hasMain = locations.some((l) => l.id === locationId);
  const locationOptions = hasMain || locationId !== MAIN_LOCATION
    ? locations
    : [{ id: MAIN_LOCATION, name: t('inventory.import.officeName') }, ...locations];

  const reset = () => {
    setFile(null);
    setOverrides({});
    setIncludeEmpty(false);
    setPhase('pick');
    setResult(null);
    setProgress({ done: 0, total: 0 });
  };

  const close = () => {
    if (phase === 'importing') return; // a half-written import must not lose its progress screen
    reset();
    onClose?.();
  };

  const pickFile = async (event) => {
    const chosen = event.target.files?.[0];
    event.target.value = '';
    if (!chosen) return;
    const text = await chosen.text();
    setOverrides({});
    setFile({ name: chosen.name, parsed: parseStockImport(text) });
  };

  const setOverride = (key, patch) =>
    setOverrides((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const setQty = (key, colourId, value) =>
    setOverrides((prev) => ({
      ...prev,
      [key]: { ...prev[key], qty: { ...prev[key]?.qty, [colourId]: value } },
    }));

  const runImport = async () => {
    setPhase('importing');
    setProgress({ done: 0, total: plan.ready.length });
    const location = locations.some((l) => l.id === locationId)
      ? null
      : { code: locationId, name: t('inventory.import.officeName'), type: 'MAIN' };
    const outcome = await importStock({
      models: plan.ready,
      locationId,
      location,
      fileName: file.name,
      existingBarcodes: existing.barcodes,
      actor: user,
      onProgress: (done, total) => setProgress({ done, total }),
    });
    // The dialog itself reports the result. A toast as well would sit on top
    // of its Done button on a phone, where both live at the bottom edge.
    setResult(outcome);
    setPhase('done');
  };

  const totals = plan?.totals ?? { models: 0, colours: 0, pieces: 0, listValue: 0 };
  const mergedModels = parsed?.ok ? parsed.models.filter((m) => m.rows.length > 1) : [];

  const footer =
    phase === 'done' ? (
      <Button variant="primary" onClick={close}>
        {t('inventory.import.close')}
      </Button>
    ) : (
      <>
        <Button onClick={close} disabled={phase === 'importing'}>
          {t('inventory.import.cancel')}
        </Button>
        <Button
          variant="primary"
          icon={Upload}
          disabled={!plan || totals.models === 0 || phase === 'importing' || !online}
          onClick={runImport}
        >
          {phase === 'importing'
            ? t('inventory.import.adding', { done: progress.done, total: progress.total })
            : t('inventory.import.addButton', { pieces: fmtMMK(totals.pieces) })}
        </Button>
      </>
    );

  return (
    <Modal
      open={open}
      onClose={close}
      width="max-w-4xl"
      title={t('inventory.import.title')}
      subtitle={t('inventory.import.subtitle')}
      footer={footer}
    >
      {phase === 'done' ? (
        <DoneState result={result} t={t} />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-line-base bg-raised px-3 py-2 text-xs font-medium text-ink hover:border-brand-primary">
              <FileUp size={16} aria-hidden="true" />
              <span>{file ? file.name : t('inventory.import.chooseFile')}</span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={pickFile}
                disabled={phase === 'importing'}
                className="sr-only"
              />
            </label>
            <label className="text-xs text-ink-secondary">
              <span className="mb-1 block">{t('inventory.import.location')}</span>
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                disabled={phase === 'importing'}
                className="h-8 rounded border border-line-hair bg-surface px-2 text-xs text-ink"
              >
                {locationOptions.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {!file ? (
            <p className="text-xs leading-relaxed text-ink-secondary">{t('inventory.import.help')}</p>
          ) : null}

          {parsed && !parsed.ok ? (
            <p role="alert" className="rounded-md bg-wash-critical px-3 py-2 text-xs text-status-critical">
              {t(`inventory.import.err.${parsed.error === 'COLUMNS' ? 'columns' : 'empty'}`)}
            </p>
          ) : null}

          {plan ? (
            <>
              <section
                aria-live="polite"
                className="grid grid-cols-2 gap-2 rounded-md border border-line-hair bg-raised p-3 sm:grid-cols-4"
              >
                <Figure label={t('inventory.import.models')} value={fmtMMK(totals.models)} />
                <Figure label={t('inventory.import.colours')} value={fmtMMK(totals.colours)} />
                <Figure label={t('inventory.import.pieces')} value={fmtMMK(totals.pieces)} />
                <Figure label={t('inventory.import.listValue')} value={`K ${fmtMMK(totals.listValue, { compact: true })}`} />
              </section>

              <ul className="space-y-1 text-xs text-ink-secondary">
                <li>{t('inventory.import.readRows', { rows: parsed.rowCount, models: parsed.models.length })}</li>
                {mergedModels.length ? (
                  <li>{t('inventory.import.merged', { models: mergedModels.length })}</li>
                ) : null}
                {parsed.skippedRows.length ? (
                  <li>{t('inventory.import.emptyRows', { rows: parsed.skippedRows.length })}</li>
                ) : null}
                {plan.skipped.existing.length ? (
                  <li>{t('inventory.import.existing', { models: plan.skipped.existing.length })}</li>
                ) : null}
                <li>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={includeEmpty}
                      onChange={(e) => setIncludeEmpty(e.target.checked)}
                      className="h-3.5 w-3.5"
                    />
                    {includeEmpty
                      ? t('inventory.import.includeEmptyOn')
                      : t('inventory.import.includeEmpty', { models: plan.skipped.empty.length })}
                  </label>
                </li>
                <li>{t('inventory.import.tierNote')}</li>
                {!parsed.hasCost ? <li>{t('inventory.import.costNote')}</li> : null}
              </ul>

              {flagged.length ? (
                <section>
                  <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-ink">
                    <AlertTriangle size={14} className="text-status-warning" aria-hidden="true" />
                    {t('inventory.import.attentionTitle', { count: flagged.length })}
                  </h3>
                  <ul className="space-y-2">
                    {flagged.map((model) => (
                      <AttentionItem
                        key={model.key}
                        model={model}
                        current={planned.get(model.key)}
                        included={readyKeys.has(model.key)}
                        override={overrides[model.key] ?? {}}
                        onOverride={(patch) => setOverride(model.key, patch)}
                        onQty={(colourId, value) => setQty(model.key, colourId, value)}
                        t={t}
                      />
                    ))}
                  </ul>
                </section>
              ) : null}

              {clean.length ? (
                <section>
                  <h3 className="mb-2 text-xs font-semibold text-ink">
                    {t('inventory.import.cleanTitle', { count: clean.length })}
                  </h3>
                  <div className="max-h-80 overflow-auto rounded-md border border-line-hair">
                    <table className="w-full min-w-[34rem] text-xs">
                      <thead className="sticky top-0 bg-raised text-ink-secondary">
                        <tr>
                          <th className="w-8 px-2 py-1.5">
                            <span className="sr-only">{t('inventory.import.include')}</span>
                          </th>
                          <th className="px-2 py-1.5 text-left font-medium">{t('inventory.colModel')}</th>
                          <th className="px-2 py-1.5 text-left font-medium">{t('inventory.import.brand')}</th>
                          <th className="px-2 py-1.5 text-left font-medium">{t('inventory.colColours')}</th>
                          <th className="px-2 py-1.5 text-right font-medium">{t('inventory.import.pieces')}</th>
                          <th className="px-2 py-1.5 text-right font-medium">{t('inventory.import.price')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clean.map((model) => {
                          const current = planned.get(model.key);
                          const on = readyKeys.has(model.key);
                          return (
                            <tr key={model.key} className="border-t border-line-hair">
                              <td className="px-2 py-1.5 text-center">
                                <input
                                  type="checkbox"
                                  checked={on}
                                  onChange={(e) => setOverride(model.key, { include: e.target.checked })}
                                  aria-label={t('inventory.import.includeModel', { model: model.modelNo })}
                                  className="h-3.5 w-3.5"
                                />
                              </td>
                              <td className="whitespace-nowrap px-2 py-1.5 font-medium tabular-nums text-ink">
                                {model.modelNo}
                              </td>
                              <td className="px-2 py-1.5 text-ink-secondary">{model.brand}</td>
                              <td className="px-2 py-1.5 tabular-nums text-ink-secondary">
                                {current.colours.map((c) => `${c.label} ${c.qty}`).join(' · ')}
                              </td>
                              <td className="px-2 py-1.5 text-right tabular-nums text-ink">{current.pieces}</td>
                              <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-ink">
                                {fmtMMK(current.price)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : null}

              {!online ? (
                <p role="alert" className="text-xs text-status-critical">
                  {t('inventory.import.offline')}
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      )}
    </Modal>
  );
}

function Figure({ label, value }) {
  return (
    <div>
      <p className="text-2xs text-ink-secondary">{label}</p>
      <p className="text-lg font-semibold tabular-nums text-ink">{value}</p>
    </div>
  );
}

function issueText(issue, model, current, t) {
  switch (issue.code) {
    case 'BAD_PRICE':
      return t('inventory.import.issue.badPrice', { price: issue.price ?? '—' });
    case 'HUGE_QTY':
      return t('inventory.import.issue.hugeQty', {
        colours: issue.colours
          .map((id) => `${id} ${model.colours.find((c) => c.id === id)?.qty ?? ''}`)
          .join(', '),
      });
    case 'NO_COLOURS':
      return t('inventory.import.issue.noColours', { qty: issue.qty });
    case 'UNREADABLE':
      return t('inventory.import.issue.unreadable', { entries: issue.entries.join(', ') });
    case 'PRICE_CONFLICT':
      return t('inventory.import.issue.priceConflict', {
        prices: issue.prices.map((p) => fmtMMK(p)).join(' / '),
        price: fmtMMK(current?.price ?? model.price),
      });
    case 'COUNT_MISMATCH':
      return t('inventory.import.issue.countMismatch', { counted: issue.counted, remaining: issue.remaining });
    default:
      return issue.code;
  }
}

function AttentionItem({ model, current, included, override, onOverride, onQty, t }) {
  const codes = new Set(model.issues.map((issue) => issue.code));
  const hugeColours = model.issues.find((issue) => issue.code === 'HUGE_QTY')?.colours ?? [];
  const needsYes = codes.has('NO_COLOURS');
  const canFix = !codes.has('UNREADABLE');

  return (
    <li className="rounded-md border border-line-hair px-3 py-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-ink">
            <span className="tabular-nums">{model.modelNo}</span>
            {model.brand ? <span className="text-ink-secondary"> · {model.brand}</span> : null}
            <span className="ml-1.5 text-2xs text-ink-muted">
              {t('inventory.import.rowRef', { rows: model.rows.join(', ') })}
            </span>
          </p>
          <ul className="mt-0.5 space-y-0.5">
            {model.issues.map((issue) => (
              <li
                key={issue.code}
                className={`flex items-start gap-1.5 text-2xs ${
                  issue.severity === 'warning' ? 'text-ink-secondary' : 'text-ink'
                }`}
              >
                {/* Amber marks the problem; the words stay in ink so they can be read. */}
                <span
                  aria-hidden="true"
                  className="mt-[0.3rem] h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: issue.severity === 'warning' ? 'var(--text-muted)' : 'var(--status-warning)' }}
                />
                {issueText(issue, model, current, t)}
              </li>
            ))}
          </ul>
        </div>
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-2xs font-medium ${
            included ? 'bg-wash-good text-status-good' : 'bg-raised text-ink-secondary'
          }`}
        >
          {included ? t('inventory.import.willAdd') : t('inventory.import.notAdded')}
        </span>
      </div>

      {canFix ? (
        <div className="mt-2 flex flex-wrap items-end gap-3">
          {codes.has('BAD_PRICE') || codes.has('PRICE_CONFLICT') ? (
            <label className="text-2xs text-ink-secondary">
              <span className="mb-0.5 block">{t('inventory.import.priceLabel')}</span>
              <input
                inputMode="numeric"
                value={override.price ?? ''}
                placeholder={codes.has('BAD_PRICE') ? '' : String(model.price ?? '')}
                onChange={(e) => onOverride({ price: e.target.value })}
                className={inputClass}
              />
            </label>
          ) : null}
          {hugeColours.map((id) => (
            <label key={id} className="text-2xs text-ink-secondary">
              <span className="mb-0.5 block">{t('inventory.import.qtyLabel', { colour: id })}</span>
              <input
                inputMode="numeric"
                value={override.qty?.[id] ?? ''}
                onChange={(e) => onQty(id, e.target.value)}
                className={inputClass}
              />
            </label>
          ))}
          {needsYes ? (
            <label className="inline-flex items-center gap-2 text-2xs text-ink">
              <input
                type="checkbox"
                checked={override.include === true}
                onChange={(e) => onOverride({ include: e.target.checked })}
                className="h-3.5 w-3.5"
              />
              {t('inventory.import.addAnyway', { qty: model.remaining ?? 0 })}
            </label>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function DoneState({ result, t }) {
  if (!result) return null;
  return result.ok ? (
    <div className="flex items-start gap-3">
      <CheckCircle2 size={22} className="shrink-0 text-status-good" aria-hidden="true" />
      <div className="space-y-1 text-sm text-ink">
        <p className="font-medium">
          {t('inventory.import.doneTitle', {
            models: fmtMMK(result.models),
            colours: fmtMMK(result.colours),
            pieces: fmtMMK(result.pieces),
          })}
        </p>
        <p className="text-xs text-ink-secondary">{t('inventory.import.doneNext')}</p>
      </div>
    </div>
  ) : (
    <div className="flex items-start gap-3">
      <AlertTriangle size={22} className="shrink-0 text-status-critical" aria-hidden="true" />
      <div className="space-y-1 text-sm text-ink">
        <p className="font-medium">{result.message}</p>
        <p className="text-xs text-ink-secondary">{t('inventory.import.retryNote')}</p>
      </div>
    </div>
  );
}
