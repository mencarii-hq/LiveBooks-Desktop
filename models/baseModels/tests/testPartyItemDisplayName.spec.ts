import test from 'tape';
import { ModelNameEnum } from 'models/types';
import { assertThrows } from 'backend/database/tests/helpers';
import { closeTestFyo, getTestFyo, setupTestFyo } from 'tests/helpers';
import { isUuidDocId } from 'utils/ids';
import { Party } from '../Party/Party';
import { Item } from '../Item/Item';
import { SalesInvoice } from '../SalesInvoice/SalesInvoice';

const fyo = getTestFyo();
setupTestFyo(fyo, __filename);

test('Party getNewDoc: Employee role uses Employee temp name', (t) => {
  const doc = fyo.doc.getNewDoc(ModelNameEnum.Party, {
    role: 'Employee',
  }) as Party;

  t.ok(String(doc.name).includes('Employee'), 'temp name contains Employee');
  t.notOk(
    String(doc.name).includes('Customers & Suppliers'),
    'temp name does not use Customers & Suppliers label'
  );
  t.ok(
    fyo.doc.isTemporaryName(doc.name!, doc.schema, 'Employee'),
    'isTemporaryName recognizes Employee temp name'
  );
  t.end();
});

test('Party beforeSync: human name → UUID PK + partyName', async (t) => {
  const displayName = 'Acme Corp';
  const doc = fyo.doc.getNewDoc(ModelNameEnum.Party, {
    name: displayName,
    role: 'Both',
  }) as Party;

  await doc.sync();

  t.ok(isUuidDocId(doc.name), 'party PK is UUID after sync');
  t.equal(doc.partyName, displayName, 'partyName holds human display name');
  t.ok(
    await fyo.db.exists(ModelNameEnum.Party, doc.name!),
    'party exists by UUID'
  );
});

test('Item beforeSync: human name → UUID PK + itemName', async (t) => {
  const displayName = 'Test Widget';
  const doc = fyo.doc.getNewDoc(ModelNameEnum.Item, {
    name: displayName,
    for: 'Both',
  }) as Item;

  await doc.sync();

  t.ok(isUuidDocId(doc.name), 'item PK is UUID after sync');
  t.equal(doc.itemName, displayName, 'itemName holds human display name');
  t.ok(
    await fyo.db.exists(ModelNameEnum.Item, doc.name!),
    'item exists by UUID'
  );
});

test('Party: duplicate partyName throws ValidationError', async (t) => {
  await fyo.doc
    .getNewDoc(ModelNameEnum.Party, { name: 'Unique Co', role: 'Both' })
    .sync();

  await assertThrows(async () => {
    await fyo.doc
      .getNewDoc(ModelNameEnum.Party, { name: 'unique co', role: 'Both' })
      .sync();
  }, 'duplicate partyName blocked');
});

test('Party: inline partyName rename on existing doc', async (t) => {
  const doc = fyo.doc.getNewDoc(ModelNameEnum.Party, {
    name: 'Rename Me Inc',
    role: 'Both',
  }) as Party;
  await doc.sync();

  const partyId = doc.name as string;
  await doc.setAndSync('partyName', 'Renamed Inc');

  const reloaded = (await fyo.doc.getDoc(
    ModelNameEnum.Party,
    partyId
  )) as Party;
  t.equal(reloaded.partyName, 'Renamed Inc', 'partyName updated in place');
  t.equal(reloaded.name, partyId, 'UUID PK unchanged on rename');
});

test('SalesInvoice links party by UUID PK', async (t) => {
  const itemDoc = fyo.doc.getNewDoc(ModelNameEnum.Item, {
    name: 'Invoice Item',
    for: 'Both',
    rate: 50,
  }) as Item;
  await itemDoc.sync();

  const partyDoc = fyo.doc.getNewDoc(ModelNameEnum.Party, {
    name: 'Invoice Customer',
    role: 'Both',
  }) as Party;
  await partyDoc.sync();

  const sinv = fyo.doc.getNewDoc(ModelNameEnum.SalesInvoice, {
    account: 'Debtors',
    party: partyDoc.name,
    items: [{ item: itemDoc.name, rate: 50, quantity: 1 }],
  }) as SalesInvoice;

  await sinv.runFormulas();
  await sinv.sync();

  t.equal(sinv.party, partyDoc.name, 'invoice stores party UUID');
  t.ok(
    await fyo.db.exists(ModelNameEnum.SalesInvoice, sinv.name!),
    'invoice synced'
  );
});

closeTestFyo(fyo, __filename);
