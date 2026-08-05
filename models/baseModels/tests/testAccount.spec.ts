import test from 'tape';
import { closeTestFyo, getTestFyo, setupTestFyo } from 'tests/helpers';
import { ModelNameEnum } from 'models/types';
import { ValidationError } from 'fyo/utils/errors';
import { Account } from '../Account/Account';

const fyo = getTestFyo();
setupTestFyo(fyo, __filename);

let assetGroupUuid: string;
let assetGroup2Uuid: string;
let childGroupUuid: string;
let liabilityGroupUuid: string;
let leafAccountUuid: string;

test('create test group accounts', async (t) => {
  const assetGroup = fyo.doc.getNewDoc(ModelNameEnum.Account, {
    name: 'Test Asset Group',
    rootType: 'Asset',
    parentAccount: 'Current Assets',
    isGroup: true,
  });
  await assetGroup.sync();
  assetGroupUuid = assetGroup.name as string;
  t.ok(
    await fyo.db.exists(ModelNameEnum.Account, assetGroupUuid),
    'asset group created'
  );

  const assetGroup2 = fyo.doc.getNewDoc(ModelNameEnum.Account, {
    name: 'Test Asset Group Two',
    rootType: 'Asset',
    parentAccount: 'Current Assets',
    isGroup: true,
  });
  await assetGroup2.sync();
  assetGroup2Uuid = assetGroup2.name as string;
  t.ok(
    await fyo.db.exists(ModelNameEnum.Account, assetGroup2Uuid),
    'second asset group created'
  );

  const childGroup = fyo.doc.getNewDoc(ModelNameEnum.Account, {
    name: 'Test Child Group',
    rootType: 'Asset',
    parentAccount: assetGroupUuid,
    isGroup: true,
  });
  await childGroup.sync();
  childGroupUuid = childGroup.name as string;
  t.ok(
    await fyo.db.exists(ModelNameEnum.Account, childGroupUuid),
    'child group created'
  );

  const liabilityGroup = fyo.doc.getNewDoc(ModelNameEnum.Account, {
    name: 'Test Liability Group',
    rootType: 'Liability',
    parentAccount: 'Accounts Payable',
    isGroup: true,
  });
  await liabilityGroup.sync();
  liabilityGroupUuid = liabilityGroup.name as string;
  t.ok(
    await fyo.db.exists(ModelNameEnum.Account, liabilityGroupUuid),
    'liability group created'
  );
});

test('create leaf account under asset group', async (t) => {
  const doc = fyo.doc.getNewDoc(ModelNameEnum.Account, {
    name: 'Test Account',
    rootType: 'Asset',
    parentAccount: assetGroupUuid,
    accountType: 'Bank',
    isGroup: false,
  });
  await doc.sync();
  leafAccountUuid = doc.name as string;
  t.ok(
    await fyo.db.exists(ModelNameEnum.Account, leafAccountUuid),
    'leaf account created'
  );
});

test('duplicate accountName hard-block (case-insensitive)', async (t) => {
  try {
    const doc = fyo.doc.getNewDoc(ModelNameEnum.Account, {
      name: 'test account',
      rootType: 'Asset',
      parentAccount: assetGroupUuid,
      isGroup: false,
    });
    await doc.sync();
    t.fail('should have thrown for duplicate accountName');
  } catch (error) {
    t.ok(
      error instanceof ValidationError,
      'throws ValidationError for case-insensitive duplicate'
    );
  }
});

test('trim duplicate detection', async (t) => {
  try {
    const doc = fyo.doc.getNewDoc(ModelNameEnum.Account, {
      name: '  Test Account  ',
      rootType: 'Asset',
      parentAccount: assetGroupUuid,
      isGroup: false,
    });
    await doc.sync();
    t.fail('should have thrown for trimmed duplicate accountName');
  } catch (error) {
    t.ok(
      error instanceof ValidationError,
      'throws ValidationError for trimmed duplicate'
    );
  }
});

test('accountType vs parent rootType mismatch throws', async (t) => {
  try {
    const doc = fyo.doc.getNewDoc(ModelNameEnum.Account, {
      name: 'Mismatched Type Account',
      rootType: 'Asset',
      parentAccount: assetGroupUuid,
      accountType: 'Expense Account',
      isGroup: false,
    });
    await doc.sync();
    t.fail('should have thrown for accountType / rootType mismatch');
  } catch (error) {
    t.ok(
      error instanceof ValidationError,
      'throws ValidationError for accountType vs rootType mismatch'
    );
  }
});

test('valid reparent succeeds', async (t) => {
  const doc = (await fyo.doc.getDoc(
    ModelNameEnum.Account,
    leafAccountUuid
  )) as Account;
  await doc.setAndSync('parentAccount', assetGroup2Uuid);
  t.equals(
    doc.parentAccount,
    assetGroup2Uuid,
    'parentAccount updated to second asset group'
  );
});

test('invalid reparent to wrong rootType group throws', async (t) => {
  const doc = (await fyo.doc.getDoc(
    ModelNameEnum.Account,
    leafAccountUuid
  )) as Account;
  try {
    await doc.setAndSync('parentAccount', liabilityGroupUuid);
    t.fail('should have thrown for cross-rootType reparent');
  } catch (error) {
    t.ok(
      error instanceof ValidationError,
      'throws ValidationError for reparent to wrong rootType group'
    );
  }
  await doc.load();
});

test('reparent to non-group throws', async (t) => {
  const nonGroup = fyo.doc.getNewDoc(ModelNameEnum.Account, {
    name: 'Non Group Leaf',
    rootType: 'Asset',
    parentAccount: assetGroupUuid,
    isGroup: false,
  });
  await nonGroup.sync();
  const nonGroupUuid = nonGroup.name as string;

  const doc = (await fyo.doc.getDoc(
    ModelNameEnum.Account,
    leafAccountUuid
  )) as Account;
  try {
    await doc.setAndSync('parentAccount', nonGroupUuid);
    t.fail('should have thrown for reparent to non-group');
  } catch (error) {
    t.ok(
      error instanceof ValidationError,
      'throws ValidationError for reparent to non-group account'
    );
  }
  await doc.load();
});

test('circular parent chain throws', async (t) => {
  const doc = (await fyo.doc.getDoc(
    ModelNameEnum.Account,
    assetGroupUuid
  )) as Account;
  try {
    await doc.setAndSync('parentAccount', childGroupUuid);
    t.fail('should have thrown for circular parent chain');
  } catch (error) {
    t.ok(
      error instanceof ValidationError,
      'throws ValidationError for circular parent chain'
    );
  }
  await doc.load();
});

test('group reparent without accountType still blocks wrong rootType', async (t) => {
  const doc = (await fyo.doc.getDoc(
    ModelNameEnum.Account,
    assetGroupUuid
  )) as Account;
  try {
    await doc.setAndSync('parentAccount', liabilityGroupUuid);
    t.fail('should have thrown for group cross-rootType reparent');
  } catch (error) {
    t.ok(
      error instanceof ValidationError,
      'throws ValidationError when group rootType mismatches parent'
    );
  }
  await doc.load();
});

test('parentAccount editable after insert', async (t) => {
  const doc = (await fyo.doc.getDoc(
    ModelNameEnum.Account,
    leafAccountUuid
  )) as Account;
  const readOnlyFn = doc.readOnly.parentAccount;
  t.equals(
    typeof readOnlyFn,
    'function',
    'readOnly.parentAccount is a function'
  );
  t.equals(
    readOnlyFn!(),
    false,
    'child parentAccount is not readOnly after insert'
  );
});

test('root parentAccount is readOnly and cannot gain a parent', async (t) => {
  const all = (await fyo.db.getAll(ModelNameEnum.Account, {
    fields: ['name', 'parentAccount'],
  })) as { name: string; parentAccount?: string }[];
  const rootName = all.find((a) => !a.parentAccount)?.name;
  t.ok(rootName, 'found a root account');

  const root = (await fyo.doc.getDoc(
    ModelNameEnum.Account,
    rootName!
  )) as Account;
  t.equals(
    root.readOnly.parentAccount!(),
    true,
    'root parentAccount is readOnly'
  );

  try {
    await root.setAndSync('parentAccount', assetGroupUuid);
    t.fail('should have thrown when demoting a root');
  } catch (error) {
    t.ok(
      error instanceof ValidationError,
      'throws ValidationError when root gains a parent'
    );
  }
  await root.load();
});

closeTestFyo(fyo, __filename);
