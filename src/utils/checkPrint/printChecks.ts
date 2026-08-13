import { Fyo, t } from 'fyo';
import { DateTime } from 'luxon';
import { Money } from 'pesa';
import { ModelNameEnum } from 'models/types';
import { showToast } from 'src/utils/interactive';
import { getPartyNameMap, partyLabel } from 'src/utils/partyNames';
import { getSavePath, showExportInFolder } from 'src/utils/ui';
import { amountInWords } from './amountInWords';
import { buildCheckHtml } from './buildCheckHtml';
import { buildCalibrationSample } from './calibrationSample';
import {
  getDefaultProfiles,
  parseProfiles,
  serializeProfiles,
} from './offsets';
import { CheckData, CheckFormat, CheckProfile, CheckProfiles } from './types';

const IN_TO_CM = 2.54;

export interface CheckSettings {
  activeFormat: CheckFormat;
  profiles: CheckProfiles;
  /**
   * Pre-printed check stock: suppress rendering the check number only.
   * Numbering still assigns/commits referenceId and increments
   * nextCheckNumber so records keep matching the physical checks.
   */
  omitCheckNumber: boolean;
}

export async function loadCheckSettings(fyo: Fyo): Promise<CheckSettings> {
  try {
    const doc = await fyo.doc.getDoc(ModelNameEnum.CheckPrintSettings);
    const activeFormat = (doc.activeFormat as CheckFormat) || 'voucher';
    const profiles = parseProfiles(doc.profiles as string | undefined);
    // Default on for pre-printed stock; only an explicit false turns it off.
    const omitCheckNumber = doc.omitCheckNumber !== false;
    return { activeFormat, profiles, omitCheckNumber };
  } catch {
    return {
      activeFormat: 'voucher',
      profiles: getDefaultProfiles(),
      omitCheckNumber: true,
    };
  }
}

export async function saveCheckSettings(
  fyo: Fyo,
  settings: CheckSettings
): Promise<void> {
  const doc = await fyo.doc.getDoc(ModelNameEnum.CheckPrintSettings);
  await doc.set('activeFormat', settings.activeFormat);
  await doc.set('profiles', serializeProfiles(settings.profiles));
  await doc.set('omitCheckNumber', settings.omitCheckNumber);
  await doc.sync();
}

function formatCheckDate(value: unknown): string {
  if (!value) {
    return '';
  }
  // ISO date-only ("2026-10-01") and Date-at-UTC-midnight must not use
  // local getDate() on `new Date(iso)` — that prints the prior calendar day
  // in US timezones.
  let isoDay: string | null = null;
  if (value instanceof Date) {
    if (Number.isNaN(value.valueOf())) {
      return '';
    }
    const utcMidnight =
      value.getUTCHours() === 0 &&
      value.getUTCMinutes() === 0 &&
      value.getUTCSeconds() === 0 &&
      value.getUTCMilliseconds() === 0;
    if (utcMidnight) {
      isoDay = value.toISOString().slice(0, 10);
    } else {
      return DateTime.fromJSDate(value).toFormat('MMM d, yyyy');
    }
  } else {
    isoDay = String(value).slice(0, 10);
  }
  const dt = DateTime.fromISO(isoDay, { zone: 'local' });
  if (!dt.isValid) {
    return String(value);
  }
  return dt.toFormat('MMM d, yyyy');
}

export async function getPartyAddress(
  fyo: Fyo,
  party: string,
  payeeLabel?: string
): Promise<{ address: string; hasStreetAddress: boolean }> {
  const payee = (payeeLabel && payeeLabel.trim()) || '';
  if (!party) {
    return { address: payee, hasStreetAddress: false };
  }
  try {
    const partyDoc = await fyo.doc.getDoc(ModelNameEnum.Party, party);
    const displayName =
      payee ||
      (typeof partyDoc.partyName === 'string' && partyDoc.partyName.trim()) ||
      party;
    const addressLink = partyDoc.address as string | undefined;
    if (!addressLink) {
      return { address: displayName, hasStreetAddress: false };
    }
    const addressDoc = await fyo.doc.getDoc(ModelNameEnum.Address, addressLink);
    const streetLines = [
      addressDoc.addressLine1,
      addressDoc.addressLine2,
      [addressDoc.city, addressDoc.state, addressDoc.postalCode]
        .filter(Boolean)
        .join(', '),
      addressDoc.country,
    ]
      .map((l) => (l ? String(l).trim() : ''))
      .filter(Boolean);
    const hasStreetAddress = streetLines.length > 0;
    const lines = [displayName, ...streetLines].filter(Boolean);
    return { address: lines.join('\n'), hasStreetAddress };
  } catch {
    return { address: payee, hasStreetAddress: false };
  }
}

/**
 * Build display-ready CheckData for the given payments. `numbers` maps payment
 * name → assigned check number (provisional, held in memory before commit).
 */
export async function buildCheckDataForPayments(
  fyo: Fyo,
  paymentNames: string[],
  numbers: Record<string, string> = {}
): Promise<CheckData[]> {
  const payments = await Promise.all(
    paymentNames.map((name) => fyo.doc.getDoc(ModelNameEnum.Payment, name))
  );
  const partyNames = await getPartyNameMap(
    fyo,
    payments.map((p) => (p.party as string) || '')
  );

  const checks: CheckData[] = [];
  for (let i = 0; i < paymentNames.length; i++) {
    const name = paymentNames[i];
    const payment = payments[i];
    const amountMoney = payment.amount as Money | undefined;
    const amountFloat = amountMoney?.float ?? 0;
    const party = (payment.party as string) || '';
    const payee = partyLabel(partyNames, party);
    const addr = await getPartyAddress(fyo, party, payee);
    checks.push({
      paymentName: name,
      checkNumber: numbers[name] ?? (payment.referenceId as string) ?? '',
      date: formatCheckDate(payment.date),
      payee,
      address: addr.address,
      hasStreetAddress: addr.hasStreetAddress,
      amountNumeric: fyo.format(amountMoney as never, ModelNameEnum.Currency),
      amountWords: amountInWords(amountFloat),
      memo: (payment.memo as string) || '',
    });
  }
  return checks;
}

/** True if any check has payee name only — no street address for a window. */
export function anyMissingAddress(checks: CheckData[]): boolean {
  return checks.some((c) => !c.hasStreetAddress);
}

export async function confirmMissingStreetAddress(
  checks: CheckData[]
): Promise<boolean> {
  if (!anyMissingAddress(checks)) {
    return true;
  }
  const missing = [
    ...new Set(
      checks
        .filter((c) => !c.hasStreetAddress)
        .map((c) => String(c.payee || c.paymentName || ''))
    ),
  ];
  const names = missing.slice(0, 5).join(', ');
  const more =
    missing.length > 5 ? t` (+${String(missing.length - 5)} more)` : '';
  const { showDialog } = await import('src/utils/interactive');
  const proceed = await showDialog({
    title: t`No street address`,
    detail: t`Payee name will print in the address window for: ${names}${more}. Add a street address on the payee for window envelopes — or print anyway.`,
    type: 'warning',
    buttons: [
      { label: t`Cancel`, action: () => false, isEscape: true },
      { label: t`Print anyway`, action: () => true, isPrimary: true },
    ],
  });
  return !!proceed;
}

async function renderDocument(
  html: string,
  profile: CheckProfile,
  options: { asPdf?: boolean; fileName?: string }
): Promise<boolean> {
  const widthCm = profile.pageWidthIn * IN_TO_CM;
  const heightCm = profile.pageHeightIn * IN_TO_CM;

  if (options.asPdf) {
    const { filePath } = await getSavePath(options.fileName || 'checks', 'pdf');
    if (!filePath) {
      return false;
    }
    const success = await ipc.makePDF(html, filePath, widthCm, heightCm);
    if (success) {
      showExportInFolder(t`Checks saved as PDF`, filePath);
    } else {
      showToast({ message: t`Save as PDF failed`, type: 'error' });
    }
    return success;
  }

  return await ipc.printDocument(html, widthCm, heightCm);
}

/** Print (or PDF) a batch of checks. One dialog / one document (W3). */
export async function printCheckBatch(
  checks: CheckData[],
  format: CheckFormat,
  profile: CheckProfile,
  options: {
    asPdf?: boolean;
    fileName?: string;
    /** Pre-printed stock (#5): render-only omit; numbering is unaffected. */
    omitCheckNumber?: boolean;
  } = {}
): Promise<boolean> {
  if (!checks.length) {
    return false;
  }
  const renderChecks = options.omitCheckNumber
    ? checks.map((c) => ({ ...c, checkNumber: '' }))
    : checks;
  const html = buildCheckHtml(renderChecks, format, profile);
  return await renderDocument(html, profile, options);
}

/** Print a calibration sample for the active/selected format. */
export async function printCalibrationSample(
  format: CheckFormat,
  profile: CheckProfile,
  options: { asPdf?: boolean; omitCheckNumber?: boolean } = {}
): Promise<boolean> {
  const html = buildCalibrationSample(format, profile, {
    omitCheckNumber: options.omitCheckNumber,
  });
  return await renderDocument(html, profile, {
    ...options,
    fileName: `check-calibration-${format}`,
  });
}

/**
 * Print or reprint a single Payment as a check in the given format.
 * Reprint (X1) keeps the existing check number; first print runs the
 * assign → print → confirm flow.
 */
export async function printPaymentAsCheck(
  fyo: Fyo,
  payment: {
    name?: string | null;
    account?: string;
    amount?: { float?: number } | null;
    referenceId?: string;
    printLater?: boolean;
    paymentMethod?: string;
  },
  format: CheckFormat
): Promise<void> {
  const { isCheckMethod } = await import('src/utils/memorizedTransactions');
  const method = (payment.paymentMethod as string) || '';
  if (!(await isCheckMethod(fyo, method))) {
    showToast({
      type: 'warning',
      message: t`Payment method must be Check to print a check.`,
    });
    return;
  }

  const settings = await loadCheckSettings(fyo);
  const profile = settings.profiles[format] ?? settings.profiles.voucher;
  const paymentName = String(payment.name || '');
  if (!paymentName) {
    return;
  }

  // Already printed (X1): reprint keeping the same number.
  const existingRef = (payment.referenceId as string)?.trim();
  if (existingRef && !payment.printLater) {
    const checks = await buildCheckDataForPayments(fyo, [paymentName], {
      [paymentName]: existingRef,
    });
    if (!(await confirmMissingStreetAddress(checks))) {
      return;
    }
    await printCheckBatch(checks, format, profile, {
      omitCheckNumber: settings.omitCheckNumber,
    });
    return;
  }

  const amount =
    payment.amount && typeof payment.amount === 'object'
      ? Number(payment.amount.float) || 0
      : 0;
  const { runCheckPrintFlow } = await import(
    'src/utils/checkPrint/runCheckPrintFlow'
  );
  await runCheckPrintFlow(
    fyo,
    [
      {
        paymentName,
        bankAccount: String(payment.account || ''),
        amount,
      },
    ],
    { format }
  );
}
