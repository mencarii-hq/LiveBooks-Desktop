import { Fyo, t } from 'fyo';
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
}

export async function loadCheckSettings(fyo: Fyo): Promise<CheckSettings> {
  try {
    const doc = await fyo.doc.getDoc(ModelNameEnum.CheckPrintSettings);
    const activeFormat = (doc.activeFormat as CheckFormat) || 'voucher';
    const profiles = parseProfiles(doc.profiles as string | undefined);
    return { activeFormat, profiles };
  } catch {
    return { activeFormat: 'voucher', profiles: getDefaultProfiles() };
  }
}

export async function saveCheckSettings(
  fyo: Fyo,
  settings: CheckSettings
): Promise<void> {
  const doc = await fyo.doc.getDoc(ModelNameEnum.CheckPrintSettings);
  await doc.set('activeFormat', settings.activeFormat);
  await doc.set('profiles', serializeProfiles(settings.profiles));
  await doc.sync();
}

function formatCheckDate(value: unknown): string {
  if (!value) {
    return '';
  }
  const date = new Date(value as string);
  if (Number.isNaN(date.valueOf())) {
    return String(value);
  }
  return `${date.toLocaleString('default', {
    month: 'short',
  })} ${date.getDate()}, ${date.getFullYear()}`;
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
  options: { asPdf?: boolean; fileName?: string } = {}
): Promise<boolean> {
  if (!checks.length) {
    return false;
  }
  const html = buildCheckHtml(checks, format, profile);
  return await renderDocument(html, profile, options);
}

/** Print a calibration sample for the active/selected format. */
export async function printCalibrationSample(
  format: CheckFormat,
  profile: CheckProfile,
  options: { asPdf?: boolean } = {}
): Promise<boolean> {
  const html = buildCalibrationSample(format, profile);
  return await renderDocument(html, profile, {
    ...options,
    fileName: `check-calibration-${format}`,
  });
}
