import { useMemo, useState } from 'react';
import { Copy, Printer, Send } from 'lucide-react';
import {
  buildReminderText,
  buildStatementText,
  copyText,
  nativeShare,
  shareTo,
} from '../../services/statementService';
import { COMPANY } from '../../lib/constants';
import { townshipLabel } from '../../constants/districts';
import { useLocale } from '../../context/LocaleContext';
import { fmtDate } from '../../lib/dates';
import { fmtMMK } from '../../lib/format';
import { useToast } from '../ui/Toast';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

/**
 * Two artefacts from one state object:
 *  - a plain-text message shaped for a Viber/Telegram bubble (the channel that
 *    actually gets read in Yangon), and
 *  - a printable A5 statement for shops that want paper.
 *
 * Printing uses the browser's own engine ("Save as PDF" in the print dialog)
 * rather than bundling a PDF library — it keeps the offline bundle small and
 * renders Myanmar script correctly, which is the hard part of embedding fonts
 * in a client-side PDF.
 */
export function StatementModal({ open, shop, state, onClose }) {
  const { t, locale } = useLocale();
  const toast = useToast();
  const [mode, setMode] = useState('reminder');

  const text = useMemo(
    () => {
      if (!shop || !state) return '';
      return mode === 'reminder' ? buildReminderText(shop, state) : buildStatementText(shop, state);
    },
    // locale: the message is built in the reader's language.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shop, state, mode, locale],
  );

  if (!open || !shop) return null;

  const onCopy = async () => {
    const ok = await copyText(text);
    toast.push(ok ? t('credit.messageCopied') : t('common.copyFailed'), {
      tone: ok ? 'success' : 'error',
    });
  };

  const onSend = async (target) => {
    if (target === 'native') {
      const shared = await nativeShare(t('credit.statementShareTitle', { shop: shop.name }), text);
      if (!shared) await onCopy();
      return;
    }
    shareTo(target, text);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="max-w-2xl"
      title={t('credit.sendStatement')}
      subtitle={`${shop.name} · ${shop.phone ?? t('credit.noPhone')}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('ui.close')}
          </Button>
          <Button variant="secondary" icon={Printer} onClick={() => window.print()}>
            {t('credit.printPdf')}
          </Button>
          <Button variant="primary" icon={Send} onClick={() => onSend('native')}>
            {t('common.share')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-1 rounded-md border border-line-hair p-0.5 text-xs">
          {[
            ['reminder', t('credit.shortReminder')],
            ['statement', t('credit.fullStatement')],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              className={`flex-1 rounded px-3 py-1.5 font-medium transition ${
                mode === key ? 'bg-ink text-plane' : 'text-ink-secondary hover:bg-raised'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <pre className="mm max-h-64 overflow-auto whitespace-pre-wrap rounded-card border border-line-hair bg-raised p-3 text-xs leading-relaxed text-ink">
          {text}
        </pre>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => onSend('viber')}>
            Viber
          </Button>
          <Button size="sm" variant="secondary" onClick={() => onSend('telegram')}>
            Telegram
          </Button>
          <Button size="sm" variant="secondary" onClick={() => onSend('sms')}>
            SMS
          </Button>
          <Button size="sm" variant="quiet" icon={Copy} onClick={onCopy}>
            {t('credit.copy')}
          </Button>
        </div>

        <p className="text-2xs text-ink-secondary">{t('credit.shareHint')}</p>
      </div>

      {/* Print region — A5 statement. Hidden on screen, the only thing printed. */}
      <PrintableStatement shop={shop} state={state} />
    </Modal>
  );
}

function PrintableStatement({ shop, state }) {
  const { t, locale } = useLocale();
  return (
    <div className="print-region hidden print:block">
      <div style={{ padding: '14mm', fontSize: '11pt', color: '#000' }}>
        <h1 style={{ fontSize: '14pt', margin: 0 }}>{COMPANY.name}</h1>
        <p style={{ margin: '2px 0 0', fontSize: '9pt' }}>
          {COMPANY.address} · {COMPANY.phone}
        </p>
        <hr style={{ margin: '10px 0', border: 0, borderTop: '1px solid #000' }} />

        <h2 style={{ fontSize: '12pt', margin: '0 0 6px' }}>{t('credit.statementOfAccount')}</h2>
        <p style={{ margin: 0 }}>
          <strong>{shop.name}</strong>
          {shop.nameMM ? <span className="mm"> ({shop.nameMM})</span> : null}
          <br />
          {townshipLabel(shop.township, locale)} · {shop.ownerName} · {shop.phone}
          <br />
          {t('credit.statementDate', { date: fmtDate(state.evaluatedAt) })}
        </p>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '12px', fontSize: '10pt' }}>
          <thead>
            <tr>
              {['colVoucher', 'colIssued', 'colDue', 'colBalance', 'colStatus'].map((key) => (
                <th key={key} style={{ textAlign: 'left', borderBottom: '1px solid #000', padding: '4px 2px' }}>
                  {t(`credit.${key}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {state.agedVouchers.map(({ voucher, aging }) => (
              <tr key={voucher.id}>
                <td style={{ padding: '4px 2px', borderBottom: '1px solid #ccc' }}>{voucher.voucherNo}</td>
                <td style={{ padding: '4px 2px', borderBottom: '1px solid #ccc' }}>{fmtDate(voucher.issueDate, 'dd/MM/yy')}</td>
                <td style={{ padding: '4px 2px', borderBottom: '1px solid #ccc' }}>{fmtDate(aging.dueDate, 'dd/MM/yy')}</td>
                <td style={{ padding: '4px 2px', borderBottom: '1px solid #ccc', textAlign: 'right' }}>
                  {fmtMMK(aging.balanceDue)}
                </td>
                <td style={{ padding: '4px 2px', borderBottom: '1px solid #ccc' }}>
                  {aging.isOverdue
                    ? t('credit.overdueTag', { n: aging.daysOverdue })
                    : t('credit.dueInTag', { n: aging.daysUntilDue })}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} style={{ padding: '6px 2px', fontWeight: 700 }}>
                {t('credit.totalOutstanding')}
              </td>
              <td style={{ padding: '6px 2px', textAlign: 'right', fontWeight: 700 }}>
                {fmtMMK(state.outstanding)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>

        <p style={{ marginTop: '10px', fontSize: '9pt' }}>
          {t('credit.creditTermNote', { days: shop.creditTermDays ?? 14 })}
        </p>
      </div>
    </div>
  );
}
