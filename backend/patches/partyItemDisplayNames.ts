/**
 * Party / Item display-name migration.
 *
 * Mirrors Account's UUID + accountName pattern:
 * 1. Ensure partyName / itemName columns exist
 * 2. Backfill display names (with Tier-C recovery when PKs are already UUIDs
 *    but link columns still hold the old human-readable names)
 * 3. Rewrite every Link + DynamicLink targeting Party/Item to the new UUID PK
 * 4. Rename non-UUID Party/Item primary keys to UUIDs
 *
 * Must run after schema migrate (post patch) so display columns exist, and after
 * uuidIdentityMigration so Tier-C damage can be repaired.
 */

import { generateDocId, isUuidDocId } from 'utils/ids';
import { getDefaultMetaFieldValueMap } from 'backend/helpers';
import { getSchemas } from '../../schemas';
import type { SchemaMap } from '../../schemas/types';
import { DatabaseManager } from '../database/manager';
import type { Knex } from 'knex';

type MasterConfig = {
  table: 'Party' | 'Item';
  displayField: 'partyName' | 'itemName';
  placeholderPrefix: string;
};

const MASTERS: MasterConfig[] = [
  { table: 'Party', displayField: 'partyName', placeholderPrefix: 'Party' },
  { table: 'Item', displayField: 'itemName', placeholderPrefix: 'Item' },
];

async function execute(dm: DatabaseManager) {
  const knex = dm.db?.knex;
  if (!knex) {
    return;
  }

  const countryCode =
    (
      (await knex('SingleValue')
        .where({ fieldname: 'countryCode' })
        .first()) as { value?: string } | undefined
    )?.value ?? 'us';

  const schemaMap = getSchemas(countryCode, []);

  await knex.transaction(async (trx) => {
    for (const master of MASTERS) {
      await migrateMaster(trx, schemaMap, master);
    }
  });
}

async function migrateMaster(
  trx: Knex,
  schemaMap: SchemaMap,
  master: MasterConfig
): Promise<void> {
  const { table, displayField, placeholderPrefix } = master;
  if (!(await trx.schema.hasTable(table))) {
    return;
  }

  if (!(await trx.schema.hasColumn(table, displayField))) {
    await trx.schema.alterTable(table, (t) => {
      t.string(displayField);
    });
  }

  const rows = (await trx(table).select(
    'name',
    displayField,
    trx.raw('rowid as rowid')
  )) as { name: string; rowid: number; [k: string]: unknown }[];

  const linkTargets = await collectLinkTargets(trx, schemaMap, table);
  const danglingByFirstSeen = await collectDanglingLinkValues(
    trx,
    linkTargets,
    new Set(rows.map((r) => r.name))
  );

  // oldHumanName → newUuid (for link rewrite). Identity when already UUID.
  const renameMap = new Map<string, string>();
  // UUID parties/items still needing a display name, ordered by rowid.
  const emptyDisplayUuids: { name: string; rowid: number }[] = [];

  for (const row of rows) {
    const currentDisplay = String(row[displayField] ?? '').trim();

    if (!isUuidDocId(row.name)) {
      // Legacy path: human-readable PK. Backfill display, assign UUID.
      const display = currentDisplay || row.name;
      const newName = generateDocId();
      renameMap.set(row.name, newName);
      await trx(table)
        .where({ name: row.name })
        .update({ [displayField]: display });
      continue;
    }

    // Already a UUID PK (greenfield, or Tier C already ran).
    renameMap.set(row.name, row.name);
    if (!currentDisplay) {
      emptyDisplayUuids.push({ name: row.name, rowid: row.rowid });
    }
  }

  // Tier-C recovery: map dangling human names onto UUID rows only when there
  // is actual per-row evidence tying them together. Guessing (e.g. zipping
  // arrays by index) can silently cross-link documents to the wrong master.
  emptyDisplayUuids.sort((a, b) => a.rowid - b.rowid);
  const danglingNames = [...danglingByFirstSeen.keys()];
  const usedDisplays = new Set<string>();

  // Existing non-empty displays (case-insensitive) for uniqueness.
  for (const row of rows) {
    const d = String(row[displayField] ?? '').trim();
    if (d) {
      usedDisplays.add(d.toLowerCase());
    }
  }
  // Also reserve human names we're about to assign from the legacy path.
  for (const [oldName, newName] of renameMap) {
    if (oldName !== newName && !isUuidDocId(oldName)) {
      usedDisplays.add(String(oldName).toLowerCase());
    }
  }

  // Evidence 1: a UUID row whose stored display name equals the dangling
  // value (case-insensitive) — the link held the old human PK, which is what
  // the display field preserves. Only a unique match counts.
  const displayToUuids = new Map<string, string[]>();
  for (const row of rows) {
    if (!isUuidDocId(row.name)) {
      continue;
    }
    const d = String(row[displayField] ?? '')
      .trim()
      .toLowerCase();
    if (!d) {
      continue;
    }
    const list = displayToUuids.get(d) ?? [];
    list.push(row.name);
    displayToUuids.set(d, list);
  }

  const unmatchedDangling: string[] = [];
  for (const danglingName of danglingNames) {
    if (renameMap.has(danglingName)) {
      continue;
    }
    const candidates = displayToUuids.get(danglingName.toLowerCase()) ?? [];
    if (candidates.length === 1) {
      renameMap.set(danglingName, candidates[0]);
    } else {
      unmatchedDangling.push(danglingName);
    }
  }

  // Evidence 2: exactly one unmatched dangling name and exactly one UUID row
  // missing a display name — the pairing is unambiguous.
  if (unmatchedDangling.length === 1 && emptyDisplayUuids.length === 1) {
    const danglingName = unmatchedDangling.shift() as string;
    const uuidRow = emptyDisplayUuids.shift() as { name: string };
    renameMap.set(danglingName, uuidRow.name);
    let display = danglingName;
    let suffix = 2;
    while (usedDisplays.has(display.toLowerCase())) {
      display = `${danglingName} (${suffix})`;
      suffix += 1;
    }
    usedDisplays.add(display.toLowerCase());
    await trx(table)
      .where({ name: uuidRow.name })
      .update({ [displayField]: display });
  }

  // UUID rows still lacking a display name get a placeholder — with no
  // evidence we must not guess which dangling name belongs to them.
  for (const uuidRow of emptyDisplayUuids) {
    const short = uuidRow.name.slice(0, 8);
    let display = `${placeholderPrefix} ${short}`;
    let suffix = 2;
    while (usedDisplays.has(display.toLowerCase())) {
      display = `${placeholderPrefix} ${short} (${suffix})`;
      suffix += 1;
    }
    usedDisplays.add(display.toLowerCase());
    // eslint-disable-next-line no-console
    console.warn(
      `[partyItemDisplayNames] ${table} ${uuidRow.name}: unrecoverable display name; using "${display}"`
    );
    await trx(table)
      .where({ name: uuidRow.name })
      .update({ [displayField]: display });
  }

  // Dangling names with no evidence-backed match: create a new master row so
  // links are not left orphaned.
  for (const oldName of unmatchedDangling) {
    if (renameMap.has(oldName)) {
      continue;
    }
    let display = oldName;
    let suffix = 2;
    while (usedDisplays.has(display.toLowerCase())) {
      display = `${oldName} (${suffix})`;
      suffix += 1;
    }
    usedDisplays.add(display.toLowerCase());
    const newName = generateDocId();
    renameMap.set(oldName, newName);
    const insertRow: Record<string, unknown> = {
      name: newName,
      [displayField]: display,
      ...getDefaultMetaFieldValueMap(),
    };
    if (table === 'Party') {
      insertRow.role = 'Both';
    } else {
      insertRow.for = 'Both';
      insertRow.itemType = 'Product';
    }
    await trx(table).insert(insertRow);
    // eslint-disable-next-line no-console
    console.warn(
      `[partyItemDisplayNames] ${table}: recreated missing master "${display}" as ${newName} for dangling links`
    );
  }

  // Child link rewrites and PK renames cannot both satisfy FKs mid-flight:
  // rewriting links first points at UUIDs that do not exist yet; renaming PKs
  // first orphans existing link values. Disable checks for the swap window
  // (same approach as updateSchemas / DatabaseCore migrations).
  await trx.raw('PRAGMA foreign_keys=OFF');
  try {
    await rewriteMasterLinkColumns(trx, schemaMap, table, renameMap);
    await rewriteParentAndReferenceName(trx, table, renameMap);

    // Finally swap non-UUID PKs → UUIDs (display already backfilled).
    for (const [oldName, newName] of renameMap) {
      if (oldName === newName) {
        continue;
      }
      if (!isUuidDocId(oldName)) {
        await trx(table).where({ name: oldName }).update({ name: newName });
      }
    }
  } finally {
    await trx.raw('PRAGMA foreign_keys=ON');
  }
}

type LinkTarget = {
  table: string;
  column: string;
  /** For DynamicLink: the references column that must equal masterTable. */
  referencesColumn?: string;
  /** For DynamicLink: required value of referencesColumn. */
  referencesValue?: string;
  isSingle?: boolean;
};

async function collectLinkTargets(
  trx: Knex,
  schemaMap: SchemaMap,
  masterTable: string
): Promise<LinkTarget[]> {
  const targets: LinkTarget[] = [];

  for (const schemaName of Object.keys(schemaMap)) {
    const schema = schemaMap[schemaName];
    if (!schema) {
      continue;
    }

    if (schema.isSingle) {
      for (const field of schema.fields) {
        if (field.fieldtype === 'Link' && field.target === masterTable) {
          targets.push({
            table: 'SingleValue',
            column: 'value',
            isSingle: true,
          });
          // SingleValue rows are filtered by parent+fieldname at rewrite time;
          // stash fieldname in referencesColumn for reuse.
          targets[
            targets.length - 1
          ].referencesColumn = `${schemaName}::${field.fieldname}`;
        }
        if (field.fieldtype === 'DynamicLink') {
          const dl = field;
          targets.push({
            table: 'SingleValue',
            column: 'value',
            isSingle: true,
            referencesColumn: `${schemaName}::${dl.fieldname}::${dl.references}::${masterTable}`,
          });
        }
      }
      continue;
    }

    const table = schema.name;
    if (table === masterTable) {
      continue;
    }
    if (!(await trx.schema.hasTable(table))) {
      continue;
    }

    for (const field of schema.fields) {
      if (field.fieldtype === 'Link' && field.target === masterTable) {
        if (!(await trx.schema.hasColumn(table, field.fieldname))) {
          continue;
        }
        targets.push({ table, column: field.fieldname });
      }
      if (field.fieldtype === 'DynamicLink') {
        const dl = field;
        if (!(await trx.schema.hasColumn(table, dl.fieldname))) {
          continue;
        }
        if (!(await trx.schema.hasColumn(table, dl.references))) {
          continue;
        }
        targets.push({
          table,
          column: dl.fieldname,
          referencesColumn: dl.references,
          referencesValue: masterTable,
        });
      }
    }
  }

  return targets;
}

/**
 * Returns Map<danglingHumanName, firstSeenRowid> for link values that do not
 * match any current master PK (the Tier-C failure mode).
 */
async function collectDanglingLinkValues(
  trx: Knex,
  linkTargets: LinkTarget[],
  currentPks: Set<string>
): Promise<Map<string, number>> {
  const dangling = new Map<string, number>();

  for (const target of linkTargets) {
    if (target.isSingle) {
      // SingleValue rows store one value per parent-schema + fieldname pair
      // (encoded in referencesColumn by collectLinkTargets). They must join
      // the dangling collection too — rewriteMasterLinkColumns only rewrites
      // values that made it into renameMap.
      const [schemaName, fieldname, referencesField, referencedMaster] = (
        target.referencesColumn ?? ''
      ).split('::');
      if (!schemaName || !fieldname) {
        continue;
      }
      if (referencesField) {
        // DynamicLink single: only when the stored type is this master.
        const typeRow = (await trx('SingleValue')
          .select('value')
          .where({ parent: schemaName, fieldname: referencesField })
          .first()) as { value?: string } | undefined;
        if (typeRow?.value !== referencedMaster) {
          continue;
        }
      }
      const single = (await trx('SingleValue')
        .select('value')
        .select(trx.raw('rowid as firstSeen'))
        .where({ parent: schemaName, fieldname })
        .first()) as { value?: string; firstSeen: number } | undefined;
      if (
        !single?.value ||
        currentPks.has(single.value) ||
        isUuidDocId(single.value)
      ) {
        continue;
      }
      const prev = dangling.get(single.value);
      if (prev === undefined || single.firstSeen < prev) {
        dangling.set(single.value, single.firstSeen);
      }
      continue;
    }

    let query = trx(target.table)
      .select(trx.raw('?? as value', [target.column]))
      .select(trx.raw('min(rowid) as firstSeen'))
      .whereNotNull(target.column)
      .where(target.column, '!=', '');

    // DynamicLink: only rows whose type points at this master (e.g. Party not Lead).
    if (target.referencesColumn && target.referencesValue) {
      query = query.where(target.referencesColumn, target.referencesValue);
    }

    const rows = (await query.groupBy(target.column)) as {
      value: string;
      firstSeen: number;
    }[];
    for (const row of rows) {
      if (!row.value || currentPks.has(row.value) || isUuidDocId(row.value)) {
        continue;
      }
      const prev = dangling.get(row.value);
      if (prev === undefined || row.firstSeen < prev) {
        dangling.set(row.value, row.firstSeen);
      }
    }
  }

  // Sort by firstSeen for stable zip order.
  return new Map([...dangling.entries()].sort((a, b) => a[1] - b[1]));
}

async function rewriteMasterLinkColumns(
  trx: Knex,
  schemaMap: SchemaMap,
  masterTable: string,
  renameMap: Map<string, string>
): Promise<void> {
  for (const schemaName of Object.keys(schemaMap)) {
    const schema = schemaMap[schemaName];
    if (!schema) {
      continue;
    }

    if (schema.isSingle) {
      for (const field of schema.fields) {
        if (field.fieldtype === 'Link' && field.target === masterTable) {
          for (const [oldName, newName] of renameMap) {
            if (oldName === newName) {
              continue;
            }
            await trx('SingleValue')
              .where({
                parent: schemaName,
                fieldname: field.fieldname,
                value: oldName,
              })
              .update({ value: newName });
          }
        }
        if (field.fieldtype === 'DynamicLink') {
          const dl = field;
          for (const [oldName, newName] of renameMap) {
            if (oldName === newName) {
              continue;
            }
            // Only rewrite when the referenced type is this master.
            const typeRow = (await trx('SingleValue')
              .select('value')
              .where({ parent: schemaName, fieldname: dl.references })
              .first()) as { value?: string } | undefined;
            if (typeRow?.value !== masterTable) {
              continue;
            }
            await trx('SingleValue')
              .where({
                parent: schemaName,
                fieldname: dl.fieldname,
                value: oldName,
              })
              .update({ value: newName });
          }
        }
      }
      continue;
    }

    const table = schema.name;
    if (table === masterTable) {
      continue;
    }
    if (!(await trx.schema.hasTable(table))) {
      continue;
    }

    for (const field of schema.fields) {
      if (field.fieldtype === 'Link' && field.target === masterTable) {
        const col = field.fieldname;
        if (!(await trx.schema.hasColumn(table, col))) {
          continue;
        }
        for (const [oldName, newName] of renameMap) {
          if (oldName === newName) {
            continue;
          }
          await trx(table)
            .where(col, oldName)
            .update({ [col]: newName });
        }
      }

      if (field.fieldtype === 'DynamicLink') {
        const dl = field;
        if (!(await trx.schema.hasColumn(table, dl.fieldname))) {
          continue;
        }
        if (!(await trx.schema.hasColumn(table, dl.references))) {
          continue;
        }
        for (const [oldName, newName] of renameMap) {
          if (oldName === newName) {
            continue;
          }
          await trx(table)
            .where(dl.fieldname, oldName)
            .andWhere(dl.references, masterTable)
            .update({ [dl.fieldname]: newName });
        }
      }
    }
  }
}

async function rewriteParentAndReferenceName(
  trx: Knex,
  masterTable: string,
  renameMap: Map<string, string>
): Promise<void> {
  const tableRows = (await trx('sqlite_master')
    .where({ type: 'table' })
    .whereNot('name', 'like', 'sqlite_%')
    .select('name')) as { name: string }[];

  for (const { name: t } of tableRows) {
    if (t === masterTable) {
      continue;
    }
    const hasParent = await trx.schema.hasColumn(t, 'parent');
    const hasRef = await trx.schema.hasColumn(t, 'referenceName');
    if (!hasParent && !hasRef) {
      continue;
    }
    for (const [oldName, newName] of renameMap) {
      if (oldName === newName) {
        continue;
      }
      if (hasParent) {
        // Only rewrite child rows that belong to this master schema.
        if (await trx.schema.hasColumn(t, 'parentSchemaName')) {
          await trx(t)
            .where({ parent: oldName, parentSchemaName: masterTable })
            .update({ parent: newName });
        } else if (await trx.schema.hasColumn(t, 'parenttype')) {
          await trx(t)
            .where({ parent: oldName, parenttype: masterTable })
            .update({ parent: newName });
        } else {
          // Ambiguous parent column — only rewrite if this looks like a
          // child of the master (parentSchemaName missing on some forks).
          // Skip broad rewrites to avoid clobbering other docs' children.
        }
      }
      if (hasRef) {
        if (await trx.schema.hasColumn(t, 'referenceType')) {
          await trx(t)
            .where({ referenceName: oldName, referenceType: masterTable })
            .update({ referenceName: newName });
        }
      }
    }
  }
}

export default { execute };
