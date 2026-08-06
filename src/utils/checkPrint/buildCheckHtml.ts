import { getFormatLayout } from './formats';
import { resolveFieldPosition } from './offsets';
import { CheckData, CheckFormat, CheckProfile } from './types';

/** Escape untrusted user strings before injecting into the check HTML (XSS). */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeMultiline(value: unknown): string {
  return escapeHtml(value).replace(/\r?\n/g, '<br>');
}

function fieldValue(check: CheckData, fieldname: keyof CheckData): string {
  const raw = check[fieldname];
  if (fieldname === 'address') {
    return escapeMultiline(raw);
  }
  return escapeHtml(raw);
}

/**
 * S1 shrink-to-fit: after the document loads, reduce the font-size of any
 * `.lbchk-fit` region until its content stops overflowing (down to a floor).
 * Runs inside the hidden print/PDF BrowserWindow before print() is invoked.
 */
const SHRINK_SCRIPT = `
<script>
(function () {
  function fit(el) {
    var min = 6;
    var size = parseFloat(getComputedStyle(el).fontSize) || 12;
    var guard = 40;
    var multiline = el.getAttribute('data-multiline') === '1';
    while (guard-- > 0 && size > min) {
      var overflow = multiline
        ? el.scrollHeight > el.clientHeight + 1
        : el.scrollWidth > el.clientWidth + 1;
      if (!overflow) break;
      size -= 0.5;
      el.style.fontSize = size + 'px';
    }
  }
  function run() {
    var nodes = document.querySelectorAll('.lbchk-fit');
    for (var i = 0; i < nodes.length; i++) fit(nodes[i]);
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    run();
  } else {
    document.addEventListener('DOMContentLoaded', run);
  }
})();
</script>`;

function renderField(
  check: CheckData,
  profile: CheckProfile,
  fieldname: keyof CheckData,
  baseTopIn: number,
  baseLeftIn: number,
  widthIn: number,
  fontPt: number,
  align: 'left' | 'right' | 'center',
  multiline: boolean
): string {
  const pos = resolveFieldPosition(
    profile,
    fieldname as never,
    baseTopIn,
    baseLeftIn
  );
  const content =
    fieldname === 'address'
      ? fieldValue(check, 'address')
      : fieldValue(check, fieldname);
  if (!content) {
    return '';
  }
  const heightStyle = multiline ? 'height:0.85in;' : 'height:0.24in;';
  const whiteSpace = multiline ? 'normal' : 'nowrap';
  return `<div class="lbchk-fit" data-multiline="${
    multiline ? '1' : '0'
  }" style="position:absolute;top:${pos.topIn.toFixed(
    3
  )}in;left:${pos.leftIn.toFixed(3)}in;width:${widthIn.toFixed(
    3
  )}in;${heightStyle}font-size:${fontPt}pt;text-align:${align};white-space:${whiteSpace};overflow:hidden;line-height:1.15;">${content}</div>`;
}

function renderSlot(
  check: CheckData,
  profile: CheckProfile,
  format: CheckFormat,
  slotIndex: number
): string {
  const layout = getFormatLayout(format);
  const slot = layout.slots[slotIndex] ?? layout.slots[0];
  const parts: string[] = [];
  for (const f of slot.fields) {
    parts.push(
      renderField(
        check,
        profile,
        f.fieldname as keyof CheckData,
        slot.originTopIn + f.topIn,
        slot.originLeftIn + f.leftIn,
        f.widthIn,
        f.fontPt,
        f.align ?? 'left',
        f.multiline === true
      )
    );
  }
  return parts.join('\n');
}

/**
 * Build a complete, standalone multi-page HTML document for a batch of checks
 * (W3: one document per batch). Ready to hand to ipc.printDocument / makePDF.
 */
export function buildCheckHtml(
  checks: CheckData[],
  format: CheckFormat,
  profile: CheckProfile
): string {
  const layout = getFormatLayout(format);
  const perPage = Math.max(1, layout.checksPerPage);
  const pageW = profile.pageWidthIn;
  const pageH = profile.pageHeightIn;

  const pages: string[] = [];
  for (let i = 0; i < checks.length; i += perPage) {
    const pageChecks = checks.slice(i, i + perPage);
    const slotHtml = pageChecks
      .map((chk, idx) => renderSlot(chk, profile, format, idx))
      .join('\n');
    const isLast = i + perPage >= checks.length;
    pages.push(
      `<div class="lbchk-page" style="position:relative;width:${pageW}in;height:${pageH}in;overflow:hidden;${
        isLast ? '' : 'page-break-after:always;'
      }">${slotHtml}</div>`
    );
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Checks</title>
<style>
  @page { size: ${pageW}in ${pageH}in; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; }
  .lbchk-page { font-family: Arial, Helvetica, sans-serif; color: #000; }
</style>
</head>
<body>
${pages.join('\n')}
${SHRINK_SCRIPT}
</body>
</html>`;
}
