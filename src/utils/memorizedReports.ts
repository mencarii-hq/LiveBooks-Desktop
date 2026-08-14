import { t } from 'fyo';
import { Fyo } from 'fyo';
import { RawValue } from 'schemas/types';
import { ModelNameEnum } from 'models/types';
import { reports } from 'reports';
import { showDialog, showToast } from 'src/utils/interactive';

export const MEMORIZED_REPORTS_CHANGED_EVENT = 'memorized-reports-changed';

const FROZEN_DATE_FIELDS = new Set([
  'toDate',
  'fromDate',
  'fromYear',
  'toYear',
]);

export type MemorizedReportRow = {
  name: string;
  reportClassName: string;
  filtersJson: string;
};

export function toMemorizedFilterMap(
  filterMap: Record<string, RawValue>
): Record<string, RawValue> {
  const filters: Record<string, RawValue> = { relativeDates: true };
  for (const [key, value] of Object.entries(filterMap)) {
    if (FROZEN_DATE_FIELDS.has(key)) {
      continue;
    }
    filters[key] = value;
  }
  return filters;
}

export async function listMemorizedReports(
  fyo: Fyo
): Promise<MemorizedReportRow[]> {
  try {
    const rows = (await fyo.db.getAllRaw(ModelNameEnum.MemorizedReport, {
      fields: ['name', 'reportClassName', 'filtersJson'],
    })) as MemorizedReportRow[];
    return rows.map((row) => ({
      name: String(row.name ?? ''),
      reportClassName: String(row.reportClassName ?? ''),
      filtersJson: String(row.filtersJson ?? '{}'),
    }));
  } catch {
    return [];
  }
}

export function getReservedReportTitle(reportClassName: string): string {
  return String(
    reports[reportClassName as keyof typeof reports]?.title ?? reportClassName
  );
}

export function isReservedReportTitle(
  reportClassName: string,
  name: string
): boolean {
  return (
    name.trim().toLowerCase() ===
    getReservedReportTitle(reportClassName).trim().toLowerCase()
  );
}

export function suggestMemorizedReportName(
  reportClassName: string,
  existingNames: string[]
): string {
  const base = getReservedReportTitle(reportClassName);
  const taken = new Set(
    existingNames.map((row) => row.trim().toLowerCase()).filter(Boolean)
  );
  taken.add(base.trim().toLowerCase());

  let index = 1;
  let candidate = `${base} ${index}`;
  while (taken.has(candidate.toLowerCase())) {
    index += 1;
    candidate = `${base} ${index}`;
  }
  return candidate;
}

export function getMemorizedReportPath(row: MemorizedReportRow): string {
  const query = new URLSearchParams({
    defaultFilters: row.filtersJson || '{}',
    memorizedName: row.name,
  });
  return `/report/${row.reportClassName}?${query.toString()}`;
}

export async function saveMemorizedReport(
  fyo: Fyo,
  reportClassName: string,
  name: string,
  filterMap: Record<string, RawValue>
): Promise<boolean> {
  const title = name.trim();
  if (!title) {
    return false;
  }

  if (isReservedReportTitle(reportClassName, title)) {
    await showDialog({
      title: t`Name already used`,
      detail: t`${title} is the default report. Choose a different name.`,
      buttons: [{ label: t`OK`, action: () => true, isPrimary: true }],
    });
    return false;
  }

  const exists = await fyo.db.exists(ModelNameEnum.MemorizedReport, title);
  if (exists) {
    const proceed = await showDialog({
      title: t`Overwrite memorized report?`,
      detail: t`${title} already exists. Save these filters over it?`,
      buttons: [
        { label: t`Cancel`, action: () => false, isEscape: true },
        { label: t`Overwrite`, action: () => true, isPrimary: true },
      ],
    });
    if (!proceed) {
      return false;
    }

    const doc = await fyo.doc.getDoc(ModelNameEnum.MemorizedReport, title);
    await doc.setAndSync({
      reportClassName,
      filtersJson: JSON.stringify(toMemorizedFilterMap(filterMap)),
    });
  } else {
    const doc = fyo.doc.getNewDoc(ModelNameEnum.MemorizedReport, {
      name: title,
      reportClassName,
      filtersJson: JSON.stringify(toMemorizedFilterMap(filterMap)),
    });
    await doc.sync();
  }

  document.dispatchEvent(new Event(MEMORIZED_REPORTS_CHANGED_EVENT));
  showToast({
    type: 'success',
    message: t`${title} memorized`,
  });
  return true;
}

export async function promptAndSaveMemorizedReport(
  fyo: Fyo,
  reportClassName: string,
  filterMap: Record<string, RawValue>
): Promise<string> {
  const existing = await listMemorizedReports(fyo);
  const fallback = suggestMemorizedReportName(
    reportClassName,
    existing.map((row) => row.name)
  );
  const entered = await showDialog({
    title: t`Memorize Report`,
    detail: t`Save these filters and re-run with dates resolved when you open it. The name cannot match the default report.`,
    input: { placeholder: t`Name`, value: fallback },
    buttons: [
      { label: t`Cancel`, action: () => '', isEscape: true },
      {
        label: t`Memorize`,
        action: (value?: string) => String(value || '').trim(),
        isPrimary: true,
      },
    ],
  });

  const title = String(entered || '').trim();
  if (!title) {
    return '';
  }

  const saved = await saveMemorizedReport(
    fyo,
    reportClassName,
    title,
    filterMap
  );
  return saved ? title : '';
}

export async function deleteMemorizedReport(
  fyo: Fyo,
  name: string
): Promise<boolean> {
  const title = name.trim();
  if (!title) {
    return false;
  }

  const proceed = await showDialog({
    title: t`Delete memorized report?`,
    detail: t`${title} will be removed from Reports.`,
    buttons: [
      { label: t`Cancel`, action: () => false, isEscape: true },
      { label: t`Delete`, action: () => true, isPrimary: true },
    ],
  });
  if (!proceed) {
    return false;
  }

  const doc = await fyo.doc.getDoc(ModelNameEnum.MemorizedReport, title);
  await doc.delete();
  document.dispatchEvent(new Event(MEMORIZED_REPORTS_CHANGED_EVENT));
  showToast({
    type: 'success',
    message: t`${title} deleted`,
  });
  return true;
}
