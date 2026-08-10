import { Fyo } from 'fyo';
import { ModelNameEnum } from 'models/types';

/**
 * Batch-resolve Party UUIDs (`name`) to display labels (`partyName`).
 * Falls back to the id when partyName is missing.
 */
export async function getPartyNameMap(
  fyo: Fyo,
  partyIds: string[]
): Promise<Map<string, string>> {
  const ids = [
    ...new Set(partyIds.map((id) => String(id || '').trim()).filter(Boolean)),
  ];
  if (!ids.length) {
    return new Map();
  }
  const parties = (await fyo.db.getAll(ModelNameEnum.Party, {
    fields: ['name', 'partyName'],
    filters: { name: ['in', ids] },
  })) as { name: string; partyName?: string }[];
  return new Map(parties.map((p) => [p.name, p.partyName?.trim() || p.name]));
}

/** Look up a display label; falls back to the id (or empty string). */
export function partyLabel(
  map: Map<string, string>,
  id: string | undefined | null
): string {
  if (!id) {
    return '';
  }
  return map.get(id) || id;
}
