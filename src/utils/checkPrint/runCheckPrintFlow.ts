import { Fyo, t } from 'fyo';
import { showDialog, showToast } from 'src/utils/interactive';
import {
  anyMissingAddress,
  buildCheckDataForPayments,
  loadCheckSettings,
  printCheckBatch,
} from './printChecks';
import {
  assignBatchNumbers,
  CheckAssignment,
  CheckQueueItem,
  CheckSkip,
  commitAssignments,
} from './numbering';
import { CheckFormat } from './types';

export interface CheckPrintFlowResult {
  printed: number;
  skipped: CheckSkip[];
  cancelled: boolean;
}

/**
 * Full batch print / PDF flow:
 * assign-first (memory) → soft warns → one dialog/PDF → N3 checklist confirm →
 * commit checked assignments (Q-AA). Unchecked / cancel rolls back (stay queued).
 */
export async function runCheckPrintFlow(
  fyo: Fyo,
  items: CheckQueueItem[],
  options: {
    asPdf?: boolean;
    format?: CheckFormat;
    /**
     * Interactive confirm. Defaults to a Yes/No dialog listing assigned numbers.
     * Return the subset that printed successfully (jam → omit failed ones).
     */
    confirmPrinted?: (
      assignments: CheckAssignment[]
    ) => Promise<CheckAssignment[] | null>;
  } = {}
): Promise<CheckPrintFlowResult> {
  if (!items.length) {
    return { printed: 0, skipped: [], cancelled: true };
  }

  if (items.length > 25) {
    const proceed = await showDialog({
      title: t`Large batch`,
      detail: t`You selected ${String(
        items.length
      )} checks. Batches over 25 may be slow. Continue?`,
      type: 'warning',
      buttons: [
        { label: t`Cancel`, action: () => false, isEscape: true },
        { label: t`Continue`, action: () => true, isPrimary: true },
      ],
    });
    if (!proceed) {
      return { printed: 0, skipped: [], cancelled: true };
    }
  }

  const { assignments, skips } = await assignBatchNumbers(fyo, items);
  if (!assignments.length) {
    await showDialog({
      title: t`Nothing to print`,
      detail:
        skips.length > 0
          ? t`All selected checks were skipped:\n${skips
              .map((s) => `• ${s.paymentName}: ${s.reason}`)
              .join('\n')}`
          : t`No checks could be assigned numbers.`,
      type: 'warning',
    });
    return { printed: 0, skipped: skips, cancelled: false };
  }

  const numbers: Record<string, string> = {};
  for (const a of assignments) {
    numbers[a.paymentName] = a.checkNumber;
  }

  const checks = await buildCheckDataForPayments(
    fyo,
    assignments.map((a) => a.paymentName),
    numbers
  );

  if (anyMissingAddress(checks)) {
    const missing = [
      ...new Set(
        checks
          .filter((c) => !c.address.trim())
          .map((c) => String(c.payee || c.paymentName || ''))
      ),
    ];
    const names = missing.slice(0, 5).join(', ');
    const more =
      missing.length > 5 ? t` (+${String(missing.length - 5)} more)` : '';

    const proceed = await showDialog({
      title: t`Missing address`,
      detail: t`These payees have no address on file: ${names}${more}. Add an address on the payee (use the link in Checks to Print), then print again — or print anyway.`,
      type: 'warning',
      buttons: [
        { label: t`Cancel`, action: () => false, isEscape: true },
        { label: t`Print anyway`, action: () => true, isPrimary: true },
      ],
    });
    if (!proceed) {
      return { printed: 0, skipped: skips, cancelled: true };
    }
  }

  const settings = await loadCheckSettings(fyo);
  const format = options.format ?? settings.activeFormat;
  const profile = settings.profiles[format] ?? settings.profiles.voucher;

  const printedOk = await printCheckBatch(checks, format, profile, {
    asPdf: options.asPdf,
    fileName: 'checks',
    omitCheckNumber: settings.omitCheckNumber,
  });

  if (!printedOk) {
    // User cancelled the system dialog / PDF save — nothing committed.
    return { printed: 0, skipped: skips, cancelled: true };
  }

  const confirmFn =
    options.confirmPrinted ?? defaultConfirmPrinted.bind(null, fyo);
  const confirmed = await confirmFn(assignments);
  if (!confirmed || !confirmed.length) {
    showToast({
      type: 'warning',
      message: t`Check numbers were not saved. Queued checks remain in Checks to Print.`,
    });
    return { printed: 0, skipped: skips, cancelled: true };
  }

  await commitAssignments(fyo, confirmed);

  if (skips.length) {
    showToast({
      type: 'warning',
      message: t`Printed ${String(confirmed.length)}. Skipped ${String(
        skips.length
      )} (still queued).`,
    });
  } else {
    showToast({
      type: 'success',
      message: t`Printed ${String(confirmed.length)} check(s).`,
    });
  }

  return { printed: confirmed.length, skipped: skips, cancelled: false };
}

/** B-lite fallback: Yes commits all assigned; No/cancel commits none. */
async function defaultConfirmPrinted(
  _fyo: Fyo,
  assignments: CheckAssignment[]
): Promise<CheckAssignment[] | null> {
  const lines = assignments.map((a) => `#${a.checkNumber} — ${a.paymentName}`);
  const ok = await showDialog({
    title: t`Did the checks print?`,
    detail: t`Confirm the checks that printed successfully. Unconfirmed numbers stay available and those payments remain queued.\n\n${lines.join(
      '\n'
    )}`,
    type: 'info',
    buttons: [
      { label: t`No / Cancel`, action: () => false, isEscape: true },
      {
        label: t`Yes — all printed`,
        action: () => true,
        isPrimary: true,
      },
    ],
  });
  return ok ? assignments : null;
}
