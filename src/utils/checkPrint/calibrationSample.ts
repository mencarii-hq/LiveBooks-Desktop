import { getFormatLayout } from './formats';
import { resolveFieldPosition } from './offsets';
import { CheckFormat, CheckProfile } from './types';

const SAMPLE_TEXT: Record<string, string> = {
  date: 'Aug 5, 2026',
  payee: 'Sample Payee Name',
  address: '123 Sample Street\nSpringfield, IL 62704',
  amountNumeric: '$1,234.56',
  amountWords: 'One Thousand Two Hundred Thirty Four and 56/100',
  memo: 'Invoice #1042',
  checkNumber: '1001',
};

/**
 * Build a calibration sample page: a 1/10 inch grid with the format's field
 * regions outlined and filled with sample text, positioned using the current
 * profile offsets. Printing this on the real stock reveals exactly how far
 * each field is off (each grid square = 10/100 inch, matching the offset unit).
 */
export function buildCalibrationSample(
  format: CheckFormat,
  profile: CheckProfile,
  options: { omitCheckNumber?: boolean } = {}
): string {
  const layout = getFormatLayout(format);
  const pageW = profile.pageWidthIn;
  const pageH = profile.pageHeightIn;

  const gridLines: string[] = [];
  // Minor lines every 0.1in.
  for (let x = 0; x <= pageW * 10; x++) {
    const major = x % 10 === 0;
    gridLines.push(
      `<div style="position:absolute;top:0;left:${(x / 10).toFixed(
        2
      )}in;width:0;height:${pageH}in;border-left:${
        major ? '0.75px solid #b9c3d6' : '0.4px solid #eef1f6'
      };"></div>`
    );
  }
  for (let y = 0; y <= pageH * 10; y++) {
    const major = y % 10 === 0;
    gridLines.push(
      `<div style="position:absolute;left:0;top:${(y / 10).toFixed(
        2
      )}in;height:0;width:${pageW}in;border-top:${
        major ? '0.75px solid #b9c3d6' : '0.4px solid #eef1f6'
      };"></div>`
    );
  }

  const boxes: string[] = [];
  layout.slots.forEach((slot, slotIndex) => {
    // Only draw sample content on the first slot to keep the grid readable.
    const drawText = slotIndex === 0;
    for (const f of slot.fields) {
      const pos = resolveFieldPosition(
        profile,
        f.fieldname,
        slot.originTopIn + f.topIn,
        slot.originLeftIn + f.leftIn
      );
      const heightIn = f.multiline ? 0.85 : 0.24;
      const sample =
        drawText && !(options.omitCheckNumber && f.fieldname === 'checkNumber')
          ? SAMPLE_TEXT[f.fieldname] ?? ''
          : '';
      // Always outline the region (including omitted check number) so offsets
      // stay calibratable; only the sample text is suppressed for pre-printed stock.
      const content = f.multiline ? sample.replace(/\n/g, '<br>') : sample;
      boxes.push(
        `<div style="position:absolute;top:${pos.topIn.toFixed(
          3
        )}in;left:${pos.leftIn.toFixed(3)}in;width:${f.widthIn.toFixed(
          3
        )}in;height:${heightIn}in;border:0.5px dashed #d05ce3;text-align:${
          f.align ?? 'left'
        };font-size:${f.fontPt}pt;color:#111;overflow:hidden;">
          <span style="position:absolute;top:-9px;left:0;font-size:5pt;color:#d05ce3;">${
            f.fieldname
          }</span>${content}</div>`
      );
    }
  });

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Check Calibration Sample</title>
<style>
  @page { size: ${pageW}in ${pageH}in; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; }
  body { font-family: Arial, Helvetica, sans-serif; }
</style>
</head>
<body>
<div style="position:relative;width:${pageW}in;height:${pageH}in;overflow:hidden;">
  ${gridLines.join('')}
  ${boxes.join('\n')}
  <div style="position:absolute;top:0.1in;left:0.1in;font-size:8pt;color:#333;">
    Check Printing calibration — ${format} — grid = 1/10&quot; (10 units)
  </div>
</div>
</body>
</html>`;
}
