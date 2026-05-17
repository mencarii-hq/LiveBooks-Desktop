import knex, { Knex } from 'knex';
import test from 'tape';
import { generateDocId } from 'utils/ids';
import {
  SCHEMA_MIGRATION_COMPLETE,
  SCHEMA_MIGRATION_NONE,
  getSchemaMigrationVersion,
  isGreenfieldUuidLedger,
  setSchemaMigrationVersion,
} from 'utils/ids/uuidIdentityState';

async function memoryKnex(): Promise<Knex> {
  const db = knex({
    client: 'better-sqlite3',
    connection: { filename: ':memory:' },
    useNullAsDefault: true,
  });
  await db.schema.createTable('SingleValue', (t) => {
    t.string('fieldname');
    t.string('value');
    t.string('parent');
  });
  await db.schema.createTable('Account', (t) => {
    t.string('name').primary();
  });
  return db;
}

test('isGreenfieldUuidLedger: empty Account table', async (t) => {
  const db = await memoryKnex();
  t.equal(await isGreenfieldUuidLedger(db), true);
  await db.destroy();
  t.end();
});

test('isGreenfieldUuidLedger: all UUID account names', async (t) => {
  const db = await memoryKnex();
  await db('Account').insert({ name: generateDocId() });
  t.equal(await isGreenfieldUuidLedger(db), true);
  await db.destroy();
  t.end();
});

test('isGreenfieldUuidLedger: legacy string account name', async (t) => {
  const db = await memoryKnex();
  await db('Account').insert({ name: 'Debtors' });
  t.equal(await isGreenfieldUuidLedger(db), false);
  await db.destroy();
  t.end();
});

test('setSchemaMigrationVersion marks complete', async (t) => {
  const db = await memoryKnex();
  t.equal(await getSchemaMigrationVersion(db), SCHEMA_MIGRATION_NONE);
  await setSchemaMigrationVersion(db, SCHEMA_MIGRATION_COMPLETE);
  t.equal(await getSchemaMigrationVersion(db), SCHEMA_MIGRATION_COMPLETE);
  t.equal(await isGreenfieldUuidLedger(db), true);
  await db.destroy();
  t.end();
});
