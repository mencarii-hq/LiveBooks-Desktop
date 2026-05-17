/**
 * Parse OFX / QFX / QBO bank download files into normalized rows.
 * Convention: amount is inflow positive, outflow negative (same as Plaid apply).
 */

export type OfxParsedRow = {
  date: string;
  description: string;
  amount: number;
  fitid: string;
};

function toText(input: string | ArrayBuffer): string {
  if (typeof input === 'string') {
    return input;
  }
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(input);
  } catch {
    return '';
  }
}

/** OFX DTPOSTED / DTUSER / DTDUE → YYYY-MM-DD */
function parseOfxDate(raw: string): string {
  const s = (raw ?? '').replace(/\[[^\]]*\]/g, '').trim();
  const ymd = s.slice(0, 8);
  if (/^\d{8}$/.test(ymd)) {
    return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
  }
  return '';
}

function readTag(block: string, tag: string): string {
  const re = new RegExp(`<${tag}>([^\\r\\n<]*)`, 'i');
  const m = block.match(re);
  return m ? m[1].trim() : '';
}

/**
 * Split OFX 1.x / 2.x content into <STMTTRN> ... segments (closing tag optional).
 */
function splitStmtTrn(content: string): string[] {
  const norm = content.replace(/\r\n/g, '\n');
  const parts = norm.split(/<STMTTRN>/i);
  if (parts.length <= 1) {
    return [];
  }
  return parts.slice(1).map((p) => `<STMTTRN>${p}`);
}

/**
 * TRNAMT in OFX: positive increases asset account balance (deposit), negative decreases (withdrawal).
 * Matches inflow positive / outflow negative for a typical checking account.
 */
function parseTrnAmt(raw: string): number {
  const v = Number.parseFloat(String(raw).replace(/,/g, '').trim());
  return Number.isFinite(v) ? v : 0;
}

export function parseOfxBankFile(input: string | ArrayBuffer):
  | {
      ok: true;
      rows: OfxParsedRow[];
    }
  | { ok: false; error: string } {
  const text = toText(input);
  if (!text.trim()) {
    return { ok: false, error: 'Empty or unreadable file.' };
  }
  if (!/OFX/i.test(text) && !/<STMTTRN>/i.test(text)) {
    return { ok: false, error: 'Not a recognized OFX/QFX/QBO file.' };
  }

  const chunks = splitStmtTrn(text);
  const rows: OfxParsedRow[] = [];

  for (const block of chunks) {
    const dt =
      parseOfxDate(readTag(block, 'DTPOSTED')) ||
      parseOfxDate(readTag(block, 'DTUSER')) ||
      parseOfxDate(readTag(block, 'DTAVAIL'));
    const trnamt = readTag(block, 'TRNAMT');
    const amount = parseTrnAmt(trnamt);
    const name = readTag(block, 'NAME');
    const memo = readTag(block, 'MEMO');
    const fitid = readTag(block, 'FITID');
    const description =
      [name, memo].filter(Boolean).join(' — ') || '(no description)';

    if (!dt) {
      continue;
    }

    rows.push({
      date: dt,
      description,
      amount,
      fitid,
    });
  }

  if (!rows.length) {
    return {
      ok: false,
      error: 'No transactions found in this OFX file.',
    };
  }

  return { ok: true, rows };
}
