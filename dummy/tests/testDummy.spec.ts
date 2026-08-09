import { assertDoesNotThrow } from 'backend/database/tests/helpers';
import { purchaseItemPartyMap } from 'dummy/helpers';
import test from 'tape';
import { getTestDbPath, getTestFyo } from 'tests/helpers';
import { setupDummyInstance } from '..';

const dbPath = getTestDbPath();
const fyo = getTestFyo();

test('setupDummyInstance', async () => {
  await assertDoesNotThrow(async () => {
    await setupDummyInstance(dbPath, fyo, 1, 25);
  }, 'setup instance failed');
});

async function existsByDisplayName(
  schemaName: 'Item' | 'Party',
  displayName: string
) {
  const field = schemaName === 'Item' ? 'itemName' : 'partyName';
  const rows = await fyo.db.getAll(schemaName, {
    filters: { [field]: displayName },
    fields: ['name'],
  });
  return rows.length > 0;
}

test('purchaseItemParty Existance', async (t) => {
  for (const item in purchaseItemPartyMap) {
    t.ok(await existsByDisplayName('Item', item), `item exists: ${item}`);

    const party = purchaseItemPartyMap[item];
    t.ok(await existsByDisplayName('Party', party), `party exists: ${party}`);
  }
});

test.onFinish(async () => {
  await fyo.close();
});
