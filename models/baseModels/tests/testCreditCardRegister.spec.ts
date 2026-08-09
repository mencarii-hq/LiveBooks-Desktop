import test from 'tape';
import { closeTestFyo, getTestFyo, setupTestFyo } from 'tests/helpers';
import { ModelNameEnum } from 'models/types';
import { createNumberSeries } from 'fyo/model/naming';
import { DEFAULT_SERIES_START } from 'fyo/utils/consts';
import { createRegisterPayment } from 'src/utils/memorizedTransactions';
import { AccountTypeEnum } from '../Account/types';

/**
 * CreditCard register posting (Desktop 1.0.4 Part 3).
 *
 * Charge (Pay): credit CreditCard, debit expense
 * Payment (Receive): debit CreditCard, credit expense/other
 * Split charge: credit CC full amount; debit each expense split
 * Pay-the-card from bank: credit Bank, debit CreditCard
 */

const fyo = getTestFyo();
setupTestFyo(fyo, __filename);

const partyName = 'CC Register Party';
let partyId = '';
const methodName = 'CC Register Cash';
let cashAccount = '';
let creditCardAccount = '';
let expenseA = '';
let expenseB = '';

interface Ale {
  account: string;
  debit: number;
  credit: number;
}

async function alesForReference(referenceName: string): Promise<Ale[]> {
  const rows = (await fyo.db.getAllRaw(ModelNameEnum.AccountingLedgerEntry, {
    fields: ['account', 'debit', 'credit'],
    filters: { referenceName },
  })) as { account: string; debit: string; credit: string }[];

  return rows.map((r) => ({
    account: r.account,
    debit: fyo.pesa(r.debit ?? 0).float,
    credit: fyo.pesa(r.credit ?? 0).float,
  }));
}

function net(ales: Ale[], account: string): { debit: number; credit: number } {
  const debit = ales
    .filter((a) => a.account === account)
    .reduce((s, a) => s + a.debit, 0);
  const credit = ales
    .filter((a) => a.account === account)
    .reduce((s, a) => s + a.credit, 0);
  return { debit, credit };
}

test('CC register setup', async (t) => {
  await createNumberSeries(
    'PAY-',
    ModelNameEnum.Payment,
    DEFAULT_SERIES_START,
    fyo
  );

  const partyDoc = await fyo.doc
    .getNewDoc(ModelNameEnum.Party, {
      name: partyName,
      partyName,
      role: 'Both',
    })
    .sync();
  partyId = partyDoc.name as string;
  t.ok(partyId, 'party exists');

  const expenseGroups = (await fyo.db.getAll(ModelNameEnum.Account, {
    filters: { isGroup: true, rootType: 'Expense' },
    fields: ['name'],
  })) as { name: string }[];
  t.ok(expenseGroups.length, 'expense group exists');

  for (const label of ['CC Expense A', 'CC Expense B']) {
    const doc = fyo.doc.getNewDoc(ModelNameEnum.Account, {
      name: label,
      accountName: label,
      rootType: 'Expense',
      parentAccount: expenseGroups[0].name,
      isGroup: false,
    });
    await doc.sync();
    if (label === 'CC Expense A') expenseA = doc.name as string;
    else expenseB = doc.name as string;
  }

  const assetGroups = (await fyo.db.getAll(ModelNameEnum.Account, {
    filters: { isGroup: true, rootType: 'Asset' },
    fields: ['name'],
  })) as { name: string }[];
  t.ok(assetGroups.length, 'asset group exists');

  const cashDoc = fyo.doc.getNewDoc(ModelNameEnum.Account, {
    name: 'CC Test Cash',
    accountName: 'CC Test Cash',
    rootType: 'Asset',
    accountType: AccountTypeEnum.Cash,
    parentAccount: assetGroups[0].name,
    isGroup: false,
  });
  await cashDoc.sync();
  cashAccount = cashDoc.name as string;

  const liabilityGroups = (await fyo.db.getAll(ModelNameEnum.Account, {
    filters: { isGroup: true, rootType: 'Liability' },
    fields: ['name'],
  })) as { name: string }[];
  t.ok(liabilityGroups.length, 'liability group exists');

  const ccDoc = fyo.doc.getNewDoc(ModelNameEnum.Account, {
    name: 'CC Test Card',
    accountName: 'CC Test Card',
    rootType: 'Liability',
    accountType: AccountTypeEnum.CreditCard,
    parentAccount: liabilityGroups[0].name,
    isGroup: false,
  });
  await ccDoc.sync();
  creditCardAccount = ccDoc.name as string;
  t.ok(
    await fyo.db.exists(ModelNameEnum.Account, creditCardAccount),
    'credit card account exists'
  );

  await fyo.doc
    .getNewDoc(ModelNameEnum.PaymentMethod, { name: methodName, type: 'Cash' })
    .sync();
});

test('CC charge (Pay): credit CreditCard, debit expense', async (t) => {
  const payment = await createRegisterPayment(fyo, {
    party: partyName,
    date: new Date(),
    amount: 75,
    bankAccount: creditCardAccount,
    categoryAccount: expenseA,
    paymentType: 'Pay',
    paymentMethod: methodName,
    memo: 'cc charge',
  });

  const ales = await alesForReference(payment.name!);
  const cc = net(ales, creditCardAccount);
  const exp = net(ales, expenseA);

  t.equal(cc.credit, 75, 'CreditCard credited (liability up)');
  t.equal(cc.debit, 0, 'CreditCard not debited');
  t.equal(exp.debit, 75, 'expense debited');
  t.equal(exp.credit, 0, 'expense not credited');
});

test('CC payment (Receive): debit CreditCard, credit expense', async (t) => {
  // Refund / payment applied on the card register (Receive).
  const payment = await createRegisterPayment(fyo, {
    party: partyName,
    date: new Date(),
    amount: 20,
    bankAccount: creditCardAccount,
    categoryAccount: expenseA,
    paymentType: 'Receive',
    paymentMethod: methodName,
    memo: 'cc payment/refund',
  });

  const ales = await alesForReference(payment.name!);
  const cc = net(ales, creditCardAccount);
  const exp = net(ales, expenseA);

  t.equal(cc.debit, 20, 'CreditCard debited (liability down)');
  t.equal(cc.credit, 0, 'CreditCard not credited');
  t.equal(exp.credit, 20, 'category credited');
});

test('split CC charge: credit CC full amount, debit each split', async (t) => {
  const payment = await createRegisterPayment(fyo, {
    party: partyName,
    date: new Date(),
    amount: 100,
    bankAccount: creditCardAccount,
    categoryAccount: expenseA,
    paymentType: 'Pay',
    paymentMethod: methodName,
    memo: 'split charge',
    splits: [
      { account: expenseA, amount: 60 },
      { account: expenseB, amount: 40 },
    ],
  });

  const ales = await alesForReference(payment.name!);
  const cc = net(ales, creditCardAccount);
  const a = net(ales, expenseA);
  const b = net(ales, expenseB);

  t.equal(cc.credit, 100, 'CreditCard credited full amount');
  t.equal(a.debit, 60, 'expense A debited 60');
  t.equal(b.debit, 40, 'expense B debited 40');
  const totalDebit = ales.reduce((s, x) => s + x.debit, 0);
  const totalCredit = ales.reduce((s, x) => s + x.credit, 0);
  t.equal(totalDebit, totalCredit, 'ledger balances');
});

test('pay the card from bank: credit Bank, debit CreditCard', async (t) => {
  const payment = await createRegisterPayment(fyo, {
    party: partyName,
    date: new Date(),
    amount: 50,
    bankAccount: cashAccount,
    categoryAccount: creditCardAccount,
    paymentType: 'Pay',
    paymentMethod: methodName,
    memo: 'pay card from cash',
  });

  const ales = await alesForReference(payment.name!);
  const cash = net(ales, cashAccount);
  const cc = net(ales, creditCardAccount);

  t.equal(cash.credit, 50, 'Cash credited (money out)');
  t.equal(cc.debit, 50, 'CreditCard debited (liability down)');
});

closeTestFyo(fyo, __filename);
