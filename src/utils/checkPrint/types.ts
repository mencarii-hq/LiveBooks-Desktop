export type CheckFormat = 'voucher' | 'threePerPage' | 'ledgerStub';

export const CHECK_FORMATS: CheckFormat[] = [
  'voucher',
  'threePerPage',
  'ledgerStub',
];

export type CheckFieldName =
  | 'date'
  | 'payee'
  | 'address'
  | 'amountNumeric'
  | 'amountWords'
  | 'memo'
  | 'checkNumber';

export const CHECK_FIELD_NAMES: CheckFieldName[] = [
  'date',
  'payee',
  'address',
  'amountNumeric',
  'amountWords',
  'memo',
  'checkNumber',
];

/** Offset in 1/100 inch (centi-inch). */
export interface FieldOffset {
  x: number;
  y: number;
}

/** One calibration profile — page geometry + offsets in 1/100 inch. */
export interface CheckProfile {
  pageWidthIn: number;
  pageHeightIn: number;
  /** Global nudge applied to every field (1/100 inch). */
  offsetX: number;
  offsetY: number;
  /** Per-field fine nudges (1/100 inch). */
  fields: Partial<Record<CheckFieldName, FieldOffset>>;
}

export type CheckProfiles = Record<CheckFormat, CheckProfile>;

/** Base position + region for a single field, in inches. */
export interface FieldLayout {
  fieldname: CheckFieldName;
  topIn: number;
  leftIn: number;
  widthIn: number;
  fontPt: number;
  align?: 'left' | 'right' | 'center';
  /** true = multi-line region (payee address), else single-line shrink. */
  multiline?: boolean;
}

/** One check region within a page (a page can hold several — 3-per-page). */
export interface CheckSlot {
  /** Vertical origin of this check within the page, in inches. */
  originTopIn: number;
  originLeftIn: number;
  fields: FieldLayout[];
}

export interface CheckFormatLayout {
  format: CheckFormat;
  pageWidthIn: number;
  pageHeightIn: number;
  /** Number of checks packed per printed page. */
  checksPerPage: number;
  slots: CheckSlot[];
}

/** Fully resolved, escaped data for a single check. */
export interface CheckData {
  paymentName?: string;
  checkNumber: string;
  date: string;
  payee: string;
  address: string;
  /** False when the address block is payee name only (no street). */
  hasStreetAddress: boolean;
  amountNumeric: string;
  amountWords: string;
  memo: string;
}

/** User-facing label for a check stock format. */
export function checkFormatLabel(
  format: CheckFormat,
  t: (s: TemplateStringsArray, ...v: unknown[]) => string
): string {
  if (format === 'threePerPage') {
    return t`3 per page`;
  }
  if (format === 'ledgerStub') {
    return t`Ledger / stub`;
  }
  return t`Voucher (1 per page)`;
}
