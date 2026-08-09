import { Fyo, t } from 'fyo';
import { DateTime } from 'luxon';
import { Money } from 'pesa';
import { ModelNameEnum } from 'models/types';
import { showToast } from 'src/utils/interactive';
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

async function getPartyAddress(fyo: Fyo, party: string): Promise<string> {
  if (!party) {
    return '';
  }
  try {
    const partyDoc = await fyo.doc.getDoc(ModelNameEnum.Party, party);
    const addressLink = partyDoc.address as string | undefined;
    if (!addressLink) {
      return '';
    }
    const addressDoc = await fyo.doc.getDoc(ModelNameEnum.Address, addressLink);
    const lines = [
      // Addressee first so the block works in an envelope window (#6).
      // Party.name is the only display name field (no separate company/person).
      // Shrink-to-fit absorbs long names / the extra line.
      party,
      addressDoc.addressLine1,
      addressDoc.addressLine2,
      [addressDoc.city, addressDoc.state, addressDoc.postalCode]
        .filter(Boolean)
        .join(', '),
      addressDoc.country,
    ]
      .map((l) => (l ? String(l).trim() : ''))
      .filter(Boolean);
    return lines.join('\n');
  } catch {
    return '';
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
  const checks: CheckData[] = [];
  for (const name of paymentNames) {
    const payment = await fyo.doc.getDoc(ModelNameEnum.Payment, name);
    const amountMoney = payment.amount as Money | undefined;
    const amountFloat = amountMoney?.float ?? 0;
    const party = (payment.party as string) || '';
    checks.push({
      paymentName: name,
      checkNumber: numbers[name] ?? (payment.referenceId as string) ?? '',
      date: formatCheckDate(payment.date),
      payee: party,
      address: await getPartyAddress(fyo, party),
      amountNumeric: fyo.format(amountMoney as never, ModelNameEnum.Currency),
      amountWords: amountInWords(amountFloat),
      memo: (payment.memo as string) || '',
    });
  }
  return checks;
}

/** True if any check is missing a payee address (Q-M: warn but allow). */
export function anyMissingAddress(checks: CheckData[]): boolean {
  return checks.some((c) => !c.address.trim());
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
