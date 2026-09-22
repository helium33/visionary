import { useMemo, useState } from 'react';
import { Copy, Printer, Send } from 'lucide-react';
import { useLocale } from '../../context/LocaleContext';
import { buildVoucherText, copyText, nativeShare, shareTo } from '../../services/statementService';
import { COMPANY } from '../../lib/constants';
import { townshipLabel } from '../../constants/districts';
import { fmtDate } from '../../lib/dates';
import { fmtMMK } from '../../lib/format';
import { useToast } from '../ui/Toast';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

/**
 * Output for an issued voucher: paper in three sizes, or a chat message.
 *
 * The @page size is switched per format — A4 and A5 for the shop's copy,
 * 80mm for the thermal roll a rep carries in the car. Printing goes through the
 * browser's own engine ("Save as PDF" in the print dialog) rather than a
 * bundled PDF library: it keeps the offline bundle small and, more importantly,
 * renders Myanmar script correctly, which is the part client-side PDF
 * generation reliably gets wrong.
 */
const FORMATS = {
  A4: { page: 'A4', width: '190mm', font: '11pt' },
  A5: { page: 'A5', width: '128mm', font: '10pt' },
  THERMAL: { page: '80mm auto', width: '72mm', font: '8.5pt' },
};

const formatLabel = (key, t) => (key === 'THERMAL' ? t('vouchers.formatThermal') : key);

export function VoucherPrint({ open, voucher, shop, onClose }) {
  const { t, locale } = useLocale();
  const toast = useToast();
  const [format, setFormat] = useState('A5');

  const text = useMemo(
    () => (voucher && shop ? buildVoucherText(voucher, shop) : ''),
    // locale: the message is built in the reader's language.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [voucher, shop, locale],
  );

  if (!open || !voucher) return null;

  const spec = FORMATS[format];

  const onCopy = async () => {
    const ok = await copyText(text);
    toast.push(t(ok ? 'vouchers.copied' : 'common.copyFailed'), {
      tone: ok ? 'success' : 'error',
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="max-w-2xl"
      title={t('vouchers.printTitle', { no: voucher.voucherNo })}
      subtitle={`${shop.name} · K ${fmtMMK(voucher.grandTotal)}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.done')}
          </Button>
          <Button variant="secondary" icon={Printer} onClick={() => window.print()}>
            {t('vouchers.print', { format: formatLabel(format, t) })}
          </Button>
          <Button
            variant="primary"
            icon={Send}
            onClick={async () => {
              const shared = await nativeShare(t('vouchers.printTitle', { no: voucher.voucherNo }), text);
              if (!shared) await onCopy();
            }}
          >
            {t('common.share')}
          </Button>
        </>
      }
    >
      {/* The print sheet size follows the chosen format. */}
      <style>{`@media print { @page { size: ${spec.page}; margin: ${
        format === 'THERMAL' ? '4mm' : '12mm'
      }; } }`}</style>

      <div className="space-y-4">
        <div className="flex gap-1 rounded-md border border-line-hair p-0.5 text-xs">
          {Object.keys(FORMATS).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFormat(key)}
              aria-pressed={format === key}
              className={`flex-1 rounded px-3 py-1.5 font-medium transition ${
                format === key ? 'bg-ink text-plane' : 'text-ink-secondary hover:bg-raised'
              }`}
            >
              {formatLabel(key, t)}
            </button>
          ))}
        </div>

        {/* On-screen preview, scaled to the chosen paper width. */}
        <div className="overflow-x-auto rounded-card border border-line-hair bg-white p-4">
          <div style={{ width: spec.width, margin: '0 auto' }}>
            <VoucherSheet voucher={voucher} shop={shop} compact={format === 'THERMAL'} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => shareTo('viber', text)}>
            Viber
          </Button>
          <Button size="sm" variant="secondary" onClick={() => shareTo('telegram', text)}>
            Telegram
          </Button>
          <Button size="sm" variant="quiet" icon={Copy} onClick={onCopy}>
            {t('common.copyText')}
          </Button>
        </div>
      </div>

      <div className="print-region hidden print:block">
        <div style={{ width: spec.width, fontSize: spec.font }}>
          <VoucherSheet voucher={voucher} shop={shop} compact={format === 'THERMAL'} />
        </div>
      </div>
    </Modal>
  );
}

/** The document itself — black on white, identical on screen and on paper. */
function VoucherSheet({ voucher, shop, compact }) {
  const { t, locale } = useLocale();
  const cell = {
    padding: compact ? '2px 1px' : '4px 2px',
    borderBottom: '1px solid #ddd',
    fontSize: compact ? '8.5pt' : '10pt',
  };
  const isConsignment = voucher.type === 'CONSIGNMENT';

  return (
    <div style={{ color: '#000', background: '#fff', fontSize: compact ? '8.5pt' : '10pt' }}>
      <div style={{ textAlign: compact ? 'center' : 'left' }}>
        <p style={{ margin: 0, fontSize: compact ? '11pt' : '14pt', fontWeight: 700 }}>
          {COMPANY.name}
        </p>
        <p className="mm" style={{ margin: 0, fontSize: compact ? '8pt' : '9pt' }}>
          {COMPANY.nameMM}
        </p>
        <p style={{ margin: '2px 0 0', fontSize: compact ? '7.5pt' : '9pt' }}>
          {COMPANY.address} · {COMPANY.phone}
        </p>
      </div>

      <hr style={{ margin: '8px 0', border: 0, borderTop: '1px solid #000' }} />

      <div
        style={{
          display: compact ? 'block' : 'flex',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        <div>
          <p style={{ margin: 0, fontWeight: 700 }}>
            {t(isConsignment ? 'vouchers.sheet.consignmentNote' : 'vouchers.sheet.salesVoucher')}
          </p>
          <p style={{ margin: 0 }}>{voucher.voucherNo}</p>
        </div>
        <div style={{ textAlign: compact ? 'left' : 'right' }}>
          <p style={{ margin: 0 }}>{t('vouchers.sheet.date', { date: fmtDate(voucher.issueDate) })}</p>
          {!isConsignment ? (
            <p style={{ margin: 0, fontWeight: 700 }}>{t('vouchers.sheet.due', { date: fmtDate(voucher.dueDate) })}</p>
          ) : null}
        </div>
      </div>

      <p style={{ margin: '8px 0 0' }}>
        <strong>{shop.name}</strong>
        {shop.nameMM ? <span className="mm"> ({shop.nameMM})</span> : null}
        <br />
        {townshipLabel(shop.township, locale)} · {shop.ownerName} · {shop.phone}
      </p>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '8px' }}>
        <thead>
          <tr>
            <th style={{ ...cell, textAlign: 'left', borderBottom: '1px solid #000' }}>{t('vouchers.sheet.colModel')}</th>
            <th style={{ ...cell, textAlign: 'left', borderBottom: '1px solid #000' }}>{t('vouchers.sheet.colColour')}</th>
            <th style={{ ...cell, textAlign: 'right', borderBottom: '1px solid #000' }}>{t('vouchers.sheet.colQty')}</th>
            <th style={{ ...cell, textAlign: 'right', borderBottom: '1px solid #000' }}>{t('vouchers.sheet.colPrice')}</th>
            <th style={{ ...cell, textAlign: 'right', borderBottom: '1px solid #000' }}>{t('vouchers.sheet.colAmount')}</th>
          </tr>
        </thead>
        <tbody>
          {voucher.items.map((item) => (
            <tr key={`${item.productId}-${item.colorCode}`}>
              <td style={cell}>{item.modelNo}</td>
              <td style={cell}>
                {item.colorCode} {compact ? '' : item.colorName}
              </td>
              <td style={{ ...cell, textAlign: 'right' }}>{item.qty}</td>
              <td style={{ ...cell, textAlign: 'right' }}>{fmtMMK(item.unitPrice)}</td>
              <td style={{ ...cell, textAlign: 'right' }}>{fmtMMK(item.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <table style={{ width: '100%', marginTop: '8px', borderCollapse: 'collapse' }}>
        <tbody>
          <SheetRow label={t('vouchers.sheet.subtotal')} value={voucher.subtotal} compact={compact} />
          {voucher.discount > 0 ? (
            <SheetRow label={t('vouchers.sheet.discount')} value={-voucher.discount} compact={compact} />
          ) : null}
          <SheetRow label={t('vouchers.thisVoucher')} value={voucher.grandTotal} bold compact={compact} />
          {!isConsignment ? (
            <>
              <SheetRow label={t('vouchers.previousBalance')} value={voucher.previousBalance} compact={compact} />
              {voucher.paymentAtIssue > 0 ? (
                <SheetRow label={t('vouchers.sheet.paidNow')} value={-voucher.paymentAtIssue} compact={compact} />
              ) : null}
              <SheetRow label={t('vouchers.sheet.totalOutstanding')} value={voucher.newBalance} bold rule compact={compact} />
            </>
          ) : null}
        </tbody>
      </table>

      {isConsignment ? (
        <p style={{ marginTop: '8px', fontSize: compact ? '7.5pt' : '9pt' }}>
          {t('vouchers.sheet.consignmentTerms')}
        </p>
      ) : (
        <p style={{ marginTop: '8px', fontSize: compact ? '7.5pt' : '9pt' }}>
          {t('vouchers.sheet.paymentTerms', { days: voucher.termDays, date: fmtDate(voucher.dueDate) })}
          {/* The English sheet keeps a Burmese line for the shop; the Burmese
              sheet already says it in full. */}
          {locale === 'en' ? (
            <>
              <br />
              <span className="mm">ရက်ပေါင်း {voucher.termDays} ရက်အတွင်း ပေးချေရပါမည်။</span>
            </>
          ) : null}
        </p>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: compact ? '14px' : '24px',
          fontSize: compact ? '7.5pt' : '9pt',
        }}
      >
        <span>{t('vouchers.sheet.receivedBy')}</span>
        <span>{voucher.createdByName ?? t('labels.role.SALES')}</span>
      </div>
    </div>
  );
}

function SheetRow({ label, value, bold, rule, compact }) {
  const style = {
    padding: compact ? '1px 1px' : '2px',
    fontWeight: bold ? 700 : 400,
    borderTop: rule ? '1px solid #000' : 'none',
    fontSize: compact ? '8.5pt' : '10pt',
  };
  return (
    <tr>
      <td style={{ ...style, textAlign: 'left' }}>{label}</td>
      <td style={{ ...style, textAlign: 'right' }}>
        {value < 0 ? '−' : ''}
        {fmtMMK(Math.abs(value))}
      </td>
    </tr>
  );
}
