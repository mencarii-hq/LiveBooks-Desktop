import { assertDoesNotThrow } from 'backend/database/tests/helpers';
import { ModelNameEnum } from 'models/types';
import {
  DEMO_CREDIT_CARD_NAME,
  DEMO_EMPLOYEES,
  purchaseItemPartyMap,
} from 'dummy/helpers';
import { PAYROLL_MEMO } from 'src/utils/payrollPayRun';
import test from 'tape';
import { getTestDbPath, getTestFyo } from 'tests/helpers';
import { setupDummyInstance } from '..';

const dbPath = getTestDbPath(':memory:');
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

async function count(
  schemaName: string,
  filters: { [key: string]: string | boolean | null } = {}
) {
  const rows = await fyo.db.getAll(schemaName, { fields: ['name'], filters });
  return rows.length;
}

test('purchaseItemParty Existance', async (t) => {
  for (const item in purchaseItemPartyMap) {
    t.ok(await existsByDisplayName('Item', item), `item exists: ${item}`);

    const party = purchaseItemPartyMap[item];
    t.ok(await existsByDisplayName('Party', party), `party exists: ${party}`);
  }
});

test('demo seed fills Home-map documents', async (t) => {
  t.ok(fyo.singles.AccountingSettings?.enableInventory, 'inventory enabled');
  t.ok((await count(ModelNameEnum.SalesQuote)) >= 8, 'estimates exist');
  t.ok(
    (await count(ModelNameEnum.PurchaseReceipt)) >= 1,
    'purchase receipts exist'
  );
  t.ok(
    (await count(ModelNameEnum.StockMovement)) >= 2,
    'stock movements exist'
  );

  for (const emp of DEMO_EMPLOYEES) {
    t.ok(
      await existsByDisplayName('Party', emp.partyName),
      `employee exists: ${emp.partyName}`
    );
  }

  const payrollPayments = await fyo.db.getAll(ModelNameEnum.Payment, {
    fields: ['name'],
    filters: { memo: PAYROLL_MEMO, submitted: true, cancelled: false },
  });
  t.ok(payrollPayments.length >= 3, 'pay run posted');

  const printLater = await fyo.db.getAll(ModelNameEnum.Payment, {
    fields: ['name'],
    filters: { printLater: true },
  });
  t.ok(printLater.length >= 1, 'print-later checks exist');

  const bankIdRows = (await fyo.db.getAll(ModelNameEnum.Account, {
    fields: ['name'],
    filters: { accountName: 'Supreme Bank' },
  })) as { name: string }[];
  t.ok(bankIdRows.length, 'Supreme Bank exists');
  const bankId = bankIdRows[0].name;
  const bankPays = await fyo.db.getAll(ModelNameEnum.Payment, {
    fields: ['name', 'clearanceDate', 'paymentType'],
    filters: { account: bankId, submitted: true },
  });
  t.ok(bankPays.length >= 1, 'Supreme Bank register has payments');
  t.ok(
    bankPays.some((p) => !p.clearanceDate),
    'uncleared bank payments exist'
  );

  t.ok(
    (await count(ModelNameEnum.MemorizedTransaction)) >= 2,
    'memorized templates exist'
  );

  const opening = await fyo.db.getAll(ModelNameEnum.JournalEntry, {
    fields: ['name'],
    filters: { entryType: 'Opening Entry' },
  });
  t.ok(opening.length >= 1, 'opening entry exists');

  const cc = await fyo.db.getAll(ModelNameEnum.Account, {
    fields: ['name'],
    filters: { accountName: DEMO_CREDIT_CARD_NAME },
  });
  t.ok(cc.length >= 1, 'credit card account exists');

  const srbnb = fyo.singles.InventorySettings?.stockReceivedButNotBilled as
    | string
    | undefined;
  t.ok(srbnb, 'stock received but not billed is set');
  const cloth = (await fyo.db.getAll(ModelNameEnum.Item, {
    fields: ['name', 'expenseAccount'],
    filters: { itemName: 'Cool Cloth' },
  })) as { expenseAccount?: string }[];
  t.equal(
    cloth[0]?.expenseAccount,
    srbnb,
    'tracked demo items expense to GRNI, not COGS'
  );
});

test.onFinish(async () => {
  await fyo.close();
});
