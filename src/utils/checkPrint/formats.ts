import { CheckFormat, CheckFormatLayout, CheckSlot } from './types';

/**
 * Static, approximate field geometry for pre-printed US Letter check stock,
 * in inches, measured from the top-left of each check region. These are the
 * calibration starting points; users fine-tune with X/Y offsets (1/100 inch)
 * in Settings → Check Printing (V1: per-format calibration).
 *
 * The layout shells live here as data (not `templates/checks/*.html`) so the
 * check pipeline stays self-contained in the renderer and never touches the
 * receipt PrintTemplate / getTemplates IPC.
 */

const LETTER_W = 8.5;
const LETTER_H = 11;

/** A single QuickBooks-style voucher check occupying the top ~3.5" of a page. */
function voucherSlot(originTopIn: number): CheckSlot {
  return {
    originTopIn,
    originLeftIn: 0,
    fields: [
      {
        fieldname: 'checkNumber',
        topIn: 0.35,
        leftIn: 6.7,
        widthIn: 1.5,
        fontPt: 11,
        align: 'right',
      },
      {
        fieldname: 'date',
        topIn: 0.85,
        leftIn: 5.7,
        widthIn: 2.4,
        fontPt: 11,
        align: 'left',
      },
      {
        fieldname: 'payee',
        topIn: 1.3,
        leftIn: 0.9,
        widthIn: 4.8,
        fontPt: 11,
        align: 'left',
      },
      {
        fieldname: 'amountNumeric',
        topIn: 1.3,
        leftIn: 6.6,
        widthIn: 1.6,
        fontPt: 11,
        align: 'right',
      },
      {
        fieldname: 'amountWords',
        topIn: 1.72,
        leftIn: 0.5,
        widthIn: 7.4,
        fontPt: 10.5,
        align: 'left',
      },
      {
        fieldname: 'address',
        topIn: 2.15,
        leftIn: 0.9,
        widthIn: 3.5,
        fontPt: 9.5,
        align: 'left',
        multiline: true,
      },
      {
        fieldname: 'memo',
        topIn: 3.0,
        leftIn: 0.6,
        widthIn: 3.2,
        fontPt: 9.5,
        align: 'left',
      },
    ],
  };
}

/** A compact check band used for 3-per-page business stock (~3.5" tall each). */
function threeUpSlot(originTopIn: number): CheckSlot {
  return {
    originTopIn,
    originLeftIn: 0,
    fields: [
      {
        fieldname: 'checkNumber',
        topIn: 0.3,
        leftIn: 6.8,
        widthIn: 1.4,
        fontPt: 10,
        align: 'right',
      },
      {
        fieldname: 'date',
        topIn: 0.72,
        leftIn: 5.9,
        widthIn: 2.2,
        fontPt: 10,
        align: 'left',
      },
      {
        fieldname: 'payee',
        topIn: 1.12,
        leftIn: 0.9,
        widthIn: 4.8,
        fontPt: 10,
        align: 'left',
      },
      {
        fieldname: 'amountNumeric',
        topIn: 1.12,
        leftIn: 6.7,
        widthIn: 1.5,
        fontPt: 10,
        align: 'right',
      },
      {
        fieldname: 'amountWords',
        topIn: 1.5,
        leftIn: 0.5,
        widthIn: 7.4,
        fontPt: 9.5,
        align: 'left',
      },
      {
        fieldname: 'memo',
        topIn: 2.6,
        leftIn: 0.6,
        widthIn: 3.2,
        fontPt: 9,
        align: 'left',
      },
    ],
  };
}

/** A check with a detachable ledger stub on the left third. */
function ledgerStubSlot(originTopIn: number): CheckSlot {
  const stubLeft = 2.9; // check portion starts after the stub
  return {
    originTopIn,
    originLeftIn: 0,
    fields: [
      // Stub (left) — mirror of key fields for record keeping.
      {
        fieldname: 'checkNumber',
        topIn: 0.4,
        leftIn: 0.3,
        widthIn: 2.3,
        fontPt: 9,
        align: 'left',
      },
      {
        fieldname: 'memo',
        topIn: 2.6,
        leftIn: 0.3,
        widthIn: 2.3,
        fontPt: 8.5,
        align: 'left',
      },
      // Check (right).
      {
        fieldname: 'date',
        topIn: 0.85,
        leftIn: stubLeft + 2.9,
        widthIn: 2.2,
        fontPt: 11,
        align: 'left',
      },
      {
        fieldname: 'payee',
        topIn: 1.3,
        leftIn: stubLeft + 0.2,
        widthIn: 3.5,
        fontPt: 11,
        align: 'left',
      },
      {
        fieldname: 'amountNumeric',
        topIn: 1.3,
        leftIn: stubLeft + 3.9,
        widthIn: 1.4,
        fontPt: 11,
        align: 'right',
      },
      {
        fieldname: 'amountWords',
        topIn: 1.72,
        leftIn: stubLeft,
        widthIn: 5.3,
        fontPt: 10.5,
        align: 'left',
      },
      {
        fieldname: 'address',
        topIn: 2.15,
        leftIn: stubLeft + 0.2,
        widthIn: 3.2,
        fontPt: 9.5,
        align: 'left',
        multiline: true,
      },
    ],
  };
}

const LAYOUTS: Record<CheckFormat, CheckFormatLayout> = {
  voucher: {
    format: 'voucher',
    pageWidthIn: LETTER_W,
    pageHeightIn: LETTER_H,
    checksPerPage: 1,
    slots: [voucherSlot(0)],
  },
  threePerPage: {
    format: 'threePerPage',
    pageWidthIn: LETTER_W,
    pageHeightIn: LETTER_H,
    checksPerPage: 3,
    slots: [threeUpSlot(0), threeUpSlot(3.5), threeUpSlot(7.0)],
  },
  ledgerStub: {
    format: 'ledgerStub',
    pageWidthIn: LETTER_W,
    pageHeightIn: LETTER_H,
    checksPerPage: 1,
    slots: [ledgerStubSlot(0)],
  },
};

export function getFormatLayout(format: CheckFormat): CheckFormatLayout {
  return LAYOUTS[format] ?? LAYOUTS.voucher;
}
