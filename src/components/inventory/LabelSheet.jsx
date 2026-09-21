import { buildQrPayload, buildSku } from '../../domain/barcode';
import { PRICE_TIERS } from '../../lib/constants';
import { fmtMMK } from '../../lib/format';
import { BarcodeSvg, QrSvg } from './CodeSvg';

/**
 * Printable label stock. Sizes are the ones actually sold in Yangon
 * stationery shops, plus the 58mm roll a rep's portable thermal printer takes.
 *
 * Dimensions are in millimetres because that is how label stock is sold and
 * how a printer lays it out; using px here would mean the labels come off the
 * sheet at whatever size the browser's DPI assumption produced, and every
 * sticker would be misaligned.
 */
export const LABEL_SIZES = {
  SMALL: { key: 'SMALL', label: '40 × 25 mm', width: 40, height: 25, perRow: 4, code: 'barcode' },
  MEDIUM: { key: 'MEDIUM', label: '50 × 30 mm', width: 50, height: 30, perRow: 3, code: 'both' },
  LARGE: { key: 'LARGE', label: '70 × 40 mm', width: 70, height: 40, perRow: 2, code: 'both' },
  THERMAL: { key: 'THERMAL', label: '58 mm roll', width: 58, height: 40, perRow: 1, code: 'barcode' },
};

/**
 * One label. Everything on it earns its place: the model and colour are what
 * a person reads off the shelf, the price is what the shop asks about, and the
 * code is what the scanner needs.
 */
export function Label({ product, variant, size, codeType, priceTier = 'STANDARD', showPrice = true }) {
  const price = product.pricing?.[priceTier] ?? product.pricing?.STANDARD ?? 0;
  const sku = buildSku(product, variant);
  const wantsBarcode = codeType === 'barcode' || codeType === 'both';
  const wantsQr = codeType === 'qr' || codeType === 'both';
  const compact = size.height <= 25;

  return (
    <div
      style={{
        width: `${size.width}mm`,
        height: `${size.height}mm`,
        padding: compact ? '1.2mm' : '2mm',
        boxSizing: 'border-box',
        background: '#fff',
        color: '#000',
        border: '1px solid #e6e6e6', // a cutting guide; label stock is pre-cut
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        overflow: 'hidden',
        breakInside: 'avoid',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1mm' }}>
        <div style={{ minWidth: 0 }}>
          <p
            style={{
              margin: 0,
              fontSize: compact ? '7.5pt' : '9pt',
              fontWeight: 700,
              lineHeight: 1.1,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {product.modelNo}
          </p>
          <p style={{ margin: 0, fontSize: compact ? '6pt' : '7pt', lineHeight: 1.2 }}>
            {variant.colorCode} {variant.colorName}
          </p>
        </div>

        {wantsQr ? (
          // Sized in millimetres: 12mm is the smallest square that still scans
          // reliably off a phone camera at arm's length.
          <QrSvg
            value={buildQrPayload(product, variant, { price })}
            size={compact ? '9mm' : '12mm'}
          />
        ) : null}
      </div>

      {showPrice ? (
        <p
          style={{
            margin: 0,
            fontSize: compact ? '8.5pt' : '11pt',
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          K {fmtMMK(price)}
          {priceTier !== 'STANDARD' ? (
            <span style={{ fontSize: '6pt', fontWeight: 400 }}>
              {' '}
              {PRICE_TIERS[priceTier]?.label}
            </span>
          ) : null}
        </p>
      ) : null}

      {wantsBarcode ? (
        <div style={{ marginTop: 'auto' }}>
          <BarcodeSvg
            value={variant.barcode}
            height={28}
            moduleWidth={1.3}
            showDigits={!compact}
            fit={compact ? '6mm' : '9mm'}
          />
          {compact ? (
            <p style={{ margin: 0, fontSize: '5pt', fontFamily: 'monospace', textAlign: 'center' }}>
              {variant.barcode}
            </p>
          ) : null}
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: '6pt', fontFamily: 'monospace' }}>{sku}</p>
      )}
    </div>
  );
}

/**
 * The sheet. Laid out as a flex-wrap grid in millimetres so what is on screen
 * is what comes out of the printer.
 */
export function LabelSheet({ labels, size, codeType, priceTier, showPrice }) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '2mm',
        background: '#fff',
        padding: '2mm',
        alignContent: 'flex-start',
      }}
    >
      {labels.map((label) => (
        <Label
          key={label.key}
          product={label.product}
          variant={label.variant}
          size={size}
          codeType={codeType}
          priceTier={priceTier}
          showPrice={showPrice}
        />
      ))}
    </div>
  );
}
