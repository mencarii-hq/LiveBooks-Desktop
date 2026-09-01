import { RawValue } from 'schemas/types';

const FROZEN_DATE_FIELDS = new Set([
  'toDate',
  'fromDate',
  'fromYear',
  'toYear',
]);

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
  if (filters.basis !== 'Cash' && filters.basis !== 'Accrual') {
    filters.basis =
      filterMap.basis === 'Cash' || filterMap.basis === 'Accrual'
        ? filterMap.basis
        : 'Accrual';
  }
  return filters;
}
