import { Fyo } from 'fyo';
import { ModelNameEnum } from 'models/types';
import { isUuidDocId } from 'utils/ids';

type PartyNameRow = { name: string; partyName?: string };

async function fetchPartyNameRows(
  fyo: Fyo,
  ids: string[]
): Promise<PartyNameRow[]> {
  if (!ids.length) {
    return [];
  }
  return (await fyo.db.getAll(ModelNameEnum.Party, {
    fields: ['name', 'partyName'],
    filters: { name: ['in', ids] },
  })) as PartyNameRow[];
}

/**
 * Batch-resolve Party UUIDs (`name`) to display labels (`partyName`).
 * Never returns a UUID as the label — chases one level when partyName was
 * incorrectly stored as another Party's id (Write Entry Link → ensureParty).
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

  const byId = new Map<string, string>();
  for (const row of await fetchPartyNameRows(fyo, ids)) {
    byId.set(row.name, String(row.partyName ?? '').trim());
  }

  // partyName may itself be a Party UUID from older Write Entry bugs.
  const chaseIds = [
    ...new Set(
      [...byId.values()].filter(
        (label) => isUuidDocId(label) && !byId.has(label)
      )
    ),
  ];
  for (const row of await fetchPartyNameRows(fyo, chaseIds)) {
    byId.set(row.name, String(row.partyName ?? '').trim());
  }

  const resolved = new Map<string, string>();
  for (const id of ids) {
    const direct = byId.get(id) ?? '';
    let label = direct;
    if (isUuidDocId(label)) {
      const chased = byId.get(label) ?? '';
      label = isUuidDocId(chased) ? '' : chased;
    }
    // Prefer a human label; never surface the Party PK.
    if (!label || isUuidDocId(label)) {
      label = '';
    }
    resolved.set(id, label);
  }
  return resolved;
}

/** Look up a display label; empty when unknown (never returns a UUID). */
export function partyLabel(
  map: Map<string, string>,
  id: string | undefined | null
): string {
  if (!id) {
    return '';
  }
  const label = map.get(id) || '';
  if (!label || isUuidDocId(label) || label === id) {
    return isUuidDocId(id) ? '' : id;
  }
  return label;
}
