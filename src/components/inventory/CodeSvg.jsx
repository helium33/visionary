import { useMemo } from 'react';
import qrcode from 'qrcode-generator';
import { encodeEan13 } from '../../domain/barcode';

/**
 * EAN-13 drawn as SVG.
 *
 * SVG rather than canvas because a label sheet prints: the printer rasterises
 * vectors at its own resolution, so the bars stay sharp at 203dpi on a thermal
 * head and at 600dpi on an office laser. A canvas bitmap would print at
 * whatever the screen gave it and scanners would struggle.
 *
 * Pure black is deliberate — scanners read contrast, so the bars ignore the
 * theme tokens the rest of the app uses and the label always prints on white.
 */
export function BarcodeSvg({ value, height = 44, moduleWidth = 1.6, showDigits = true, fit }) {
  const symbol = useMemo(() => encodeEan13(value), [value]);

  if (!symbol) {
    return (
      <div className="text-2xs text-status-critical" role="alert">
        Invalid barcode
      </div>
    );
  }

  const textHeight = showDigits ? 11 : 0;
  // The quiet zone is not decoration: a scanner needs clear space either side
  // or it cannot find the symbol's edges.
  const quietZone = 9 * moduleWidth;
  const width = symbol.moduleCount * moduleWidth + quietZone * 2;
  const barHeight = height;
  const guardExtra = showDigits ? 5 : 0;

  const isGuard = (index) =>
    symbol.guards.some(([start, end]) => index >= start && index < end);

  return (
    <svg
      viewBox={`0 0 ${width} ${barHeight + textHeight}`}
      role="img"
      aria-label={`Barcode ${symbol.code}`}
      // `fit` sizes the symbol in the label's own units (mm). The default
      // meet behaviour scales it uniformly inside that box, so the bars keep
      // their ratio and the symbol stays scannable.
      style={
        fit
          ? { display: 'block', width: '100%', height: fit }
          : { display: 'block', width: '100%' }
      }
    >
      <rect x="0" y="0" width={width} height={barHeight + textHeight} fill="#fff" />
      {[...symbol.modules].map((module, index) =>
        module === '1' ? (
          <rect
            key={index}
            x={quietZone + index * moduleWidth}
            y={0}
            width={moduleWidth}
            height={barHeight + (isGuard(index) ? guardExtra : 0)}
            fill="#000"
          />
        ) : null,
      )}

      {showDigits ? (
        <g fill="#000" fontFamily="monospace" fontSize="10">
          {/* The first digit sits outside the symbol — it is carried by the
              parity of the left-hand group, not by bars of its own. */}
          <text x={quietZone - 2} y={barHeight + 9} textAnchor="end">
            {symbol.firstDigit}
          </text>
          <text x={quietZone + 25 * moduleWidth} y={barHeight + 9} textAnchor="middle" letterSpacing="1.5">
            {symbol.leftDigits}
          </text>
          <text x={quietZone + 71 * moduleWidth} y={barHeight + 9} textAnchor="middle" letterSpacing="1.5">
            {symbol.rightDigits}
          </text>
        </g>
      ) : null}
    </svg>
  );
}

/**
 * QR as SVG, one <rect> per dark module.
 *
 * Error-correction level M: enough redundancy to survive a scuffed label in a
 * warehouse without inflating the module count so far that the code stops
 * scanning at 12mm square.
 */
export function QrSvg({ value, size = 64, margin = 2 }) {
  // `size` may be a number (px) or any CSS length, so a label can ask for mm.
  const modules = useMemo(() => {
    if (!value) return null;
    const qr = qrcode(0, 'M'); // 0 = auto-size to the data
    qr.addData(String(value));
    qr.make();
    const count = qr.getModuleCount();
    const cells = [];
    for (let row = 0; row < count; row += 1) {
      for (let col = 0; col < count; col += 1) {
        if (qr.isDark(row, col)) cells.push([col, row]);
      }
    }
    return { count, cells };
  }, [value]);

  if (!modules) return null;

  const extent = modules.count + margin * 2;

  return (
    <svg
      viewBox={`0 0 ${extent} ${extent}`}
      width={size}
      height={size}
      style={{ display: 'block', flexShrink: 0 }}
      role="img"
      aria-label={`QR code ${value}`}
      shapeRendering="crispEdges"
      style={{ display: 'block' }}
    >
      <rect x="0" y="0" width={extent} height={extent} fill="#fff" />
      {modules.cells.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x + margin} y={y + margin} width={1} height={1} fill="#000" />
      ))}
    </svg>
  );
}
