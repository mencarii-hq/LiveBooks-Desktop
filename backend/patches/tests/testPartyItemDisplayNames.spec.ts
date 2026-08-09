import DatabaseCore from 'backend/database/core';
import { getDefaultMetaFieldValueMap } from 'backend/helpers';
import { getSchemas } from 'schemas';
import test from 'tape';
import { generateDocId, isUuidDocId } from 'utils/ids';
import partyItemDisplayNames from '../partyItemDisplayNames';

async function getMigratedDb(): Promise<DatabaseCore> {
  const db = new DatabaseCore(':memory:');
  await db.connect();
  db.setSchemaMap(getSchemas('us', []));
  await db.migrate();
  return db;
}

test('partyItemDisplayNames: legacy human PK → UUID + link rewrite', async (t) => {
  const db = await getMigratedDb();
  const humanParty = 'Acme Corp';
  const humanItem = 'Widget';

  await db.knex!.raw('PRAGMA foreign_keys = OFF');

  await db.knex!('Party').insert({
    name: humanParty,
    partyName: humanParty,
    role: 'Both',
    ...getDefaultMetaFieldValueMap(),
  });

  await db.knex!('Item').insert({
    name: humanItem,
    itemName: humanItem,
    for: 'Both',
    itemType: 'Product',
    incomeAccount: 'Sales',
    expenseAccount: 'Cost of Goods Sold',
    ...getDefaultMetaFieldValueMap(),
  });

  await db.knex!('SalesInvoice').insert({
    name: 'SINV-LEGACY-1',
    party: humanParty,
    account: 'Debtors',
    numberSeries: 'SINV-',
    date: '2022-01-01',
    submitted: false,
    cancelled: false,
    ...getDefaultMetaFieldValueMap(),
  });

  await db.knex!.raw('PRAGMA foreign_keys = OFF');

  await partyItemDisplayNames.execute({ db } as never);

  await db.knex!.raw('PRAGMA foreign_keys = ON');

  const party = await db.get('Party', humanParty);
  t.equal(Object.keys(party).length, 0, 'legacy human party PK is gone');

  const parties = (await db.getAll('Party', {
    filters: { partyName: humanParty },
    fields: ['name', 'partyName'],
  })) as { name: string; partyName?: string }[];
  t.equal(parties.length, 1, 'party backfilled by display name');
  t.ok(isUuidDocId(parties[0].name), 'party PK is UUID');
  t.equal(parties[0].partyName, humanParty, 'partyName preserved');

  const items = (await db.getAll('Item', {
    filters: { itemName: humanItem },
    fields: ['name', 'itemName'],
  })) as { name: string; itemName?: string }[];
  t.equal(items.length, 1, 'item backfilled by display name');
  t.ok(isUuidDocId(items[0].name), 'item PK is UUID');
  t.equal(items[0].itemName, humanItem, 'itemName preserved');

  const invoice = (await db.get('SalesInvoice', 'SINV-LEGACY-1')) as {
    party?: string;
  };
  t.equal(
    invoice.party,
    parties[0].name,
    'SalesInvoice.party rewritten to UUID'
  );

  await db.close();
});

test('partyItemDisplayNames: Tier-C recovery from dangling human links', async (t) => {
  const db = await getMigratedDb();
  const danglingName = 'Recovered Customer';
  const partyUuid = generateDocId();

  await db.knex!('Party').insert({
    name: partyUuid,
    role: 'Both',
    partyName: '',
    ...getDefaultMetaFieldValueMap(),
  });

  // Dangling human link does not match the UUID PK (Tier-C failure mode).
  await db.knex!.raw('PRAGMA foreign_keys = OFF');
  await db.knex!('SalesInvoice').insert({
    name: 'SINV-TIERC-1',
    party: danglingName,
    account: 'Debtors',
    numberSeries: 'SINV-',
    date: '2022-02-01',
    submitted: false,
    cancelled: false,
    ...getDefaultMetaFieldValueMap(),
  });
  await db.knex!.raw('PRAGMA foreign_keys = ON');

  await partyItemDisplayNames.execute({ db } as never);

  const party = (await db.get('Party', partyUuid)) as {
    name: string;
    partyName?: string;
  };
  t.equal(
    party.partyName,
    danglingName,
    'partyName recovered from dangling link'
  );

  const invoice = (await db.get('SalesInvoice', 'SINV-TIERC-1')) as {
    party?: string;
  };
  t.equal(invoice.party, partyUuid, 'SalesInvoice.party rewritten to UUID PK');

  await db.close();
});

test('partyItemDisplayNames: ambiguous dangling links are never zipped by index', async (t) => {
  const db = await getMigratedDb();
  const uuidA = generateDocId();
  const uuidB = generateDocId();

  // Two UUID rows missing display names + two dangling names in an order
  // that does not correspond to the rows. There is no evidence pairing any
  // dangling name to any row, so none may be cross-linked.
  await db.knex!('Party').insert([
    {
      name: uuidA,
      role: 'Both',
      partyName: '',
      ...getDefaultMetaFieldValueMap(),
    },
    {
      name: uuidB,
      role: 'Both',
      partyName: '',
      ...getDefaultMetaFieldValueMap(),
    },
  ]);

  await db.knex!.raw('PRAGMA foreign_keys = OFF');
  await db.knex!('SalesInvoice').insert([
    {
      name: 'SINV-AMBIG-1',
      party: 'First Customer',
      account: 'Debtors',
      numberSeries: 'SINV-',
      date: '2022-03-01',
      submitted: false,
      cancelled: false,
      ...getDefaultMetaFieldValueMap(),
    },
    {
      name: 'SINV-AMBIG-2',
      party: 'Second Customer',
      account: 'Debtors',
      numberSeries: 'SINV-',
      date: '2022-03-02',
      submitted: false,
      cancelled: false,
      ...getDefaultMetaFieldValueMap(),
    },
  ]);
  await db.knex!.raw('PRAGMA foreign_keys = ON');

  await partyItemDisplayNames.execute({ db } as never);

  const parties = (await db.getAll('Party', {
    fields: ['name', 'partyName'],
  })) as { name: string; partyName?: string }[];
  const byDisplay = new Map(parties.map((p) => [p.partyName, p.name]));

  // Dangling names must land on newly created masters, not on uuidA/uuidB.
  for (const dangling of ['First Customer', 'Second Customer']) {
    const owner = byDisplay.get(dangling);
    t.ok(owner, `master created for "${dangling}"`);
    t.notEqual(owner, uuidA, `"${dangling}" not guessed onto first UUID row`);
    t.notEqual(owner, uuidB, `"${dangling}" not guessed onto second UUID row`);
  }

  const invoice1 = (await db.get('SalesInvoice', 'SINV-AMBIG-1')) as {
    party?: string;
  };
  const invoice2 = (await db.get('SalesInvoice', 'SINV-AMBIG-2')) as {
    party?: string;
  };
  t.equal(
    invoice1.party,
    byDisplay.get('First Customer'),
    'invoice 1 links to the recreated First Customer'
  );
  t.equal(
    invoice2.party,
    byDisplay.get('Second Customer'),
    'invoice 2 links to the recreated Second Customer'
  );

  // The unrecoverable UUID rows get placeholders instead of guessed names.
  for (const uuid of [uuidA, uuidB]) {
    const row = (await db.get('Party', uuid)) as { partyName?: string };
    t.ok(
      row.partyName?.startsWith('Party '),
      `${uuid} got a placeholder display name`
    );
  }

  await db.close();
});

test('partyItemDisplayNames: dangling link matches stored display name exactly', async (t) => {
  const db = await getMigratedDb();
  const matchedUuid = generateDocId();

  // UUID PK with the display name preserved (link columns still hold the old
  // human PK). The exact display match is evidence for the mapping.
  await db.knex!('Party').insert({
    name: matchedUuid,
    role: 'Both',
    partyName: 'Known Customer',
    ...getDefaultMetaFieldValueMap(),
  });

  await db.knex!.raw('PRAGMA foreign_keys = OFF');
  await db.knex!('SalesInvoice').insert([
    {
      name: 'SINV-MATCH-1',
      party: 'Known Customer',
      account: 'Debtors',
      numberSeries: 'SINV-',
      date: '2022-04-01',
      submitted: false,
      cancelled: false,
      ...getDefaultMetaFieldValueMap(),
    },
    {
      name: 'SINV-MATCH-2',
      party: 'Unknown Customer',
      account: 'Debtors',
      numberSeries: 'SINV-',
      date: '2022-04-02',
      submitted: false,
      cancelled: false,
      ...getDefaultMetaFieldValueMap(),
    },
  ]);
  await db.knex!.raw('PRAGMA foreign_keys = ON');

  await partyItemDisplayNames.execute({ db } as never);

  const invoice1 = (await db.get('SalesInvoice', 'SINV-MATCH-1')) as {
    party?: string;
  };
  t.equal(
    invoice1.party,
    matchedUuid,
    'display-name match links dangling value to existing UUID row'
  );

  const invoice2 = (await db.get('SalesInvoice', 'SINV-MATCH-2')) as {
    party?: string;
  };
  t.ok(
    invoice2.party && isUuidDocId(invoice2.party),
    'unknown dangling rewritten'
  );
  t.notEqual(invoice2.party, matchedUuid, 'unknown dangling not misassigned');
  const recreated = (await db.get('Party', invoice2.party!)) as {
    partyName?: string;
  };
  t.equal(
    recreated.partyName,
    'Unknown Customer',
    'unknown dangling recreated as a new master'
  );

  await db.close();
});

test('partyItemDisplayNames: SingleValue dangling links join recovery', async (t) => {
  const db = await getMigratedDb();

  // Human Party value stored only on a single (Defaults.posCustomer); no
  // Party row exists for it, so recovery must recreate the master and the
  // SingleValue row must be rewritten to the new UUID.
  await db.knex!('SingleValue').insert({
    name: generateDocId(),
    parent: 'Defaults',
    fieldname: 'posCustomer',
    value: 'POS Walk-in',
    ...getDefaultMetaFieldValueMap(),
  });

  await partyItemDisplayNames.execute({ db } as never);

  const single = (await db.knex!('SingleValue')
    .select('value')
    .where({ parent: 'Defaults', fieldname: 'posCustomer' })
    .first()) as { value?: string };
  t.ok(
    single.value && isUuidDocId(single.value),
    'SingleValue link rewritten to UUID'
  );

  const party = (await db.get('Party', single.value!)) as {
    partyName?: string;
  };
  t.equal(
    party.partyName,
    'POS Walk-in',
    'master recreated from singles value'
  );

  await db.close();
});
