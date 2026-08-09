import test from 'tape';
import { DateTime } from 'luxon';
import { closeTestFyo, getTestFyo, setupTestFyo } from 'tests/helpers';
import { ModelNameEnum } from 'models/types';
import { ValidationError } from 'fyo/utils/errors';
import { createNumberSeries } from 'fyo/model/naming';
import { DEFAULT_SERIES_START } from 'fyo/utils/consts';
import { createPaymentFromMemorized } from 'src/utils/memorizedTransactions';
import { Payment } from '../Payment/Payment';

/**
 * #8 — split transactions. A register payment can split the category side
 * into multiple lines; the bank side stays a single leg at the full amount.
 * Split amounts are signed: negative lines (payroll withholdings) post on
 * the opposite side, and the signed sum equals the (net) check amount.
 *
 * Pay 100 split 60/40:
 *   Expense A Dr 60
 *   Expense B Dr 40
 *        To Cash Cr 100
 *
 * Receive 80 split 30/50:
 *   Cash Dr 80
 *        To Expense A Cr 30
 *        To Expense B Cr 50
 *
 * Payroll: Pay 2400 net, split 3000 gross − 400/150/50 withholdings:
 *   Salary Expense Dr 3000
 *        To Federal Withholding Cr 400
 *        To State Withholding   Cr 150
 *        To Local Withholding   Cr  50
 *        To Cash                Cr 2400
 */

const fyo = getTestFyo();
setupTestFyo(fyo, __filename);

const partyName = 'Split Test Party';
// Account docs are named by UUID in this fork; ids are set after creation.
// Default fixtures (Cash account, Cash payment method's account link) are
// name-literal and broken under uuid naming, so the spec creates its own
// cash account and payment method.
const methodName = 'Split Cash';
let cashAccount = '';
let expenseA = '';
let expenseB = '';
let fedWithholding = '';
let stateWithholding = '';
let localWithholding = '';

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

function getSplitPayment(
  paymentType: 'Pay' | 'Receive',
  amount: number
): Payment {
  // Register convention: Pay credits the bank (account) and debits the
  // category (paymentAccount); Receive is the reverse. With splits the
  // first split's account stands in for the single category field.
  const account = paymentType === 'Pay' ? cashAccount : expenseA;
  const paymentAccount = paymentType === 'Pay' ? expenseA : cashAccount;

  return fyo.doc.getNewDoc(ModelNameEnum.Payment, {
    party: partyName,
    date: new Date(),
    paymentType,
    account,
    paymentAccount,
    paymentMethod: methodName,
    amount: fyo.pesa(amount),
    for: [],
  }) as Payment;
}

test('split setup: party, expense accounts, number series', async (t) => {
  // Instance setup on this fork can abort before default number series are
  // created (regional records); the Payment series is required to submit.
  await createNumberSeries(
    'PAY-',
    ModelNameEnum.Payment,
    DEFAULT_SERIES_START,
    fyo
  );
  t.ok(
    await fyo.db.exists(ModelNameEnum.NumberSeries, 'PAY-'),
    'PAY- number series exists'
  );

  await fyo.doc
    .getNewDoc(ModelNameEnum.Party, { name: partyName, role: 'Both' })
    .sync();
  t.ok(await fyo.db.exists(ModelNameEnum.Party, partyName), 'party exists');

  const groups = (await fyo.db.getAll(ModelNameEnum.Account, {
    filters: { isGroup: true, rootType: 'Expense' },
    fields: ['name'],
  })) as { name: string }[];
  t.ok(groups.length, 'an expense group account exists');

  const docA = fyo.doc.getNewDoc(ModelNameEnum.Account, {
    name: 'Split Expense A',
    rootType: 'Expense',
    parentAccount: groups[0].name,
    isGroup: false,
  });
  await docA.sync();
  expenseA = docA.name as string;
  t.ok(
    await fyo.db.exists(ModelNameEnum.Account, expenseA),
    'expense account A exists'
  );

  const docB = fyo.doc.getNewDoc(ModelNameEnum.Account, {
    name: 'Split Expense B',
    rootType: 'Expense',
    parentAccount: groups[0].name,
    isGroup: false,
  });
  await docB.sync();
  expenseB = docB.name as string;
  t.ok(
    await fyo.db.exists(ModelNameEnum.Account, expenseB),
    'expense account B exists'
  );

  const assetGroups = (await fyo.db.getAll(ModelNameEnum.Account, {
    filters: { isGroup: true, rootType: 'Asset' },
    fields: ['name'],
  })) as { name: string }[];
  t.ok(assetGroups.length, 'an asset group account exists');

  const docCash = fyo.doc.getNewDoc(ModelNameEnum.Account, {
    name: 'Split Test Cash',
    rootType: 'Asset',
    accountType: 'Cash',
    parentAccount: assetGroups[0].name,
    isGroup: false,
  });
  await docCash.sync();
  cashAccount = docCash.name as string;
  t.ok(
    await fyo.db.exists(ModelNameEnum.Account, cashAccount),
    'cash account exists'
  );

  // Cash-type method without an account link; Payment resolves the posting
  // accounts from the doc itself, and non-Bank methods need no references.
  await fyo.doc
    .getNewDoc(ModelNameEnum.PaymentMethod, { name: methodName, type: 'Cash' })
    .sync();
  t.ok(
    await fyo.db.exists(ModelNameEnum.PaymentMethod, methodName),
    'payment method exists'
  );

  const liabilityGroups = (await fyo.db.getAll(ModelNameEnum.Account, {
    filters: { isGroup: true, rootType: 'Liability' },
    fields: ['name'],
  })) as { name: string }[];
  t.ok(liabilityGroups.length, 'a liability group account exists');

  for (const label of ['Split Fed WH', 'Split State WH', 'Split Local WH']) {
    const doc = fyo.doc.getNewDoc(ModelNameEnum.Account, {
      name: label,
      rootType: 'Liability',
      parentAccount: liabilityGroups[0].name,
      isGroup: false,
    });
    await doc.sync();
    if (label === 'Split Fed WH') fedWithholding = doc.name as string;
    if (label === 'Split State WH') stateWithholding = doc.name as string;
    if (label === 'Split Local WH') localWithholding = doc.name as string;
  }
  t.ok(
    fedWithholding && stateWithholding && localWithholding,
    'withholding liability accounts exist'
  );
});

test('Pay 100 split 60/40: debit each split, credit bank full amount', async (t) => {
  const payment = getSplitPayment('Pay', 100);
  await payment.append('splits', {
    account: expenseA,
    amount: fyo.pesa(60),
    description: 'part a',
  });
  await payment.append('splits', {
    account: expenseB,
    amount: fyo.pesa(40),
    description: 'part b',
  });
  await payment.sync();
  await payment.submit();

  const ales = await alesForReference(payment.name!);
  const cash = net(ales, cashAccount);
  const a = net(ales, expenseA);
  const b = net(ales, expenseB);

  t.equal(cash.credit, 100, 'Cash is credited the full amount (100)');
  t.equal(cash.debit, 0, 'Cash is not debited');
  t.equal(a.debit, 60, 'Expense A is debited its split amount (60)');
  t.equal(b.debit, 40, 'Expense B is debited its split amount (40)');
  t.equal(a.credit + b.credit, 0, 'split accounts are not credited');

  const totalDebit = ales.reduce((s, x) => s + x.debit, 0);
  const totalCredit = ales.reduce((s, x) => s + x.credit, 0);
  t.equal(totalDebit, totalCredit, 'ledger balances');
  t.equal(totalDebit, 100, 'total posted is the payment amount');
});

test('Receive 80 split 30/50: debit bank full amount, credit each split', async (t) => {
  const payment = getSplitPayment('Receive', 80);
  await payment.append('splits', { account: expenseA, amount: fyo.pesa(30) });
  await payment.append('splits', { account: expenseB, amount: fyo.pesa(50) });
  await payment.sync();
  await payment.submit();

  const ales = await alesForReference(payment.name!);
  const cash = net(ales, cashAccount);
  const a = net(ales, expenseA);
  const b = net(ales, expenseB);

  t.equal(cash.debit, 80, 'Cash is debited the full amount (80)');
  t.equal(cash.credit, 0, 'Cash is not credited');
  t.equal(a.credit, 30, 'Split A is credited its amount (30)');
  t.equal(b.credit, 50, 'Split B is credited its amount (50)');

  const totalDebit = ales.reduce((s, x) => s + x.debit, 0);
  const totalCredit = ales.reduce((s, x) => s + x.credit, 0);
  t.equal(totalDebit, totalCredit, 'ledger balances');
});

test('split validation: sum must equal amount, at least two rows', async (t) => {
  const mismatched = getSplitPayment('Pay', 100);
  await mismatched.append('splits', {
    account: expenseA,
    amount: fyo.pesa(60),
  });
  await mismatched.append('splits', {
    account: expenseB,
    amount: fyo.pesa(50),
  });
  try {
    await mismatched.sync();
    t.fail('sync should have thrown for split total != amount');
  } catch (error) {
    t.ok(
      error instanceof ValidationError,
      'mismatched split total throws ValidationError'
    );
  }

  const single = getSplitPayment('Pay', 100);
  await single.append('splits', { account: expenseA, amount: fyo.pesa(100) });
  try {
    await single.sync();
    t.fail('sync should have thrown for a single split row');
  } catch (error) {
    t.ok(
      error instanceof ValidationError,
      'single split row throws ValidationError'
    );
  }

  const zeroLine = getSplitPayment('Pay', 100);
  await zeroLine.append('splits', { account: expenseA, amount: fyo.pesa(100) });
  await zeroLine.append('splits', { account: expenseB, amount: fyo.pesa(0) });
  try {
    await zeroLine.sync();
    t.fail('sync should have thrown for a zero-amount split row');
  } catch (error) {
    t.ok(
      error instanceof ValidationError,
      'zero-amount split row throws ValidationError'
    );
  }
});

test('payroll: gross and withholdings post signed, bank leg is net', async (t) => {
  const payment = getSplitPayment('Pay', 2400);
  await payment.append('splits', {
    account: expenseA,
    amount: fyo.pesa(3000),
    description: 'gross salary',
  });
  await payment.append('splits', {
    account: fedWithholding,
    amount: fyo.pesa(-400),
  });
  await payment.append('splits', {
    account: stateWithholding,
    amount: fyo.pesa(-150),
  });
  await payment.append('splits', {
    account: localWithholding,
    amount: fyo.pesa(-50),
  });
  await payment.sync();
  await payment.submit();

  const ales = await alesForReference(payment.name!);
  const cash = net(ales, cashAccount);
  const salary = net(ales, expenseA);
  const fed = net(ales, fedWithholding);
  const state = net(ales, stateWithholding);
  const local = net(ales, localWithholding);

  t.equal(cash.credit, 2400, 'Cash is credited the net check amount (2400)');
  t.equal(cash.debit, 0, 'Cash is not debited');
  t.equal(salary.debit, 3000, 'Salary expense is debited gross (3000)');
  t.equal(salary.credit, 0, 'Salary expense is not credited');
  t.equal(fed.credit, 400, 'Federal withholding is credited 400');
  t.equal(state.credit, 150, 'State withholding is credited 150');
  t.equal(local.credit, 50, 'Local withholding is credited 50');
  t.equal(
    fed.debit + state.debit + local.debit,
    0,
    'withholdings are not debited'
  );

  const totalDebit = ales.reduce((s, x) => s + x.debit, 0);
  const totalCredit = ales.reduce((s, x) => s + x.credit, 0);
  t.equal(totalDebit, totalCredit, 'ledger balances');
  t.equal(totalDebit, 3000, 'total posted is the gross amount');
});

test('payroll validation: signed mismatch and all-negative lines reject', async (t) => {
  // 3000 − 500 = 2500 ≠ 2400.
  const mismatched = getSplitPayment('Pay', 2400);
  await mismatched.append('splits', {
    account: expenseA,
    amount: fyo.pesa(3000),
  });
  await mismatched.append('splits', {
    account: fedWithholding,
    amount: fyo.pesa(-500),
  });
  try {
    await mismatched.sync();
    t.fail('sync should have thrown for signed sum != amount');
  } catch (error) {
    t.ok(
      error instanceof ValidationError,
      'signed sum mismatch throws ValidationError'
    );
  }

  // No positive line: nothing to post on the category side.
  const allNegative = getSplitPayment('Pay', 100);
  await allNegative.append('splits', {
    account: fedWithholding,
    amount: fyo.pesa(-50),
  });
  await allNegative.append('splits', {
    account: stateWithholding,
    amount: fyo.pesa(-50),
  });
  try {
    await allNegative.sync();
    t.fail('sync should have thrown for splits without a positive line');
  } catch (error) {
    t.ok(
      error instanceof ValidationError,
      'all-negative split lines throw ValidationError'
    );
  }
});

test('memorized payroll template replays with correct signs', async (t) => {
  const mt = fyo.doc.getNewDoc(ModelNameEnum.MemorizedTransaction, {
    title: 'Payroll Template',
    party: partyName,
    paymentType: 'Pay',
    fromAccount: cashAccount,
    toAccount: expenseA,
    amount: fyo.pesa(2400),
    frequency: 'Monthly',
    paymentMethod: methodName,
    nextDueDate: DateTime.now().plus({ days: 1 }).toISODate(),
  });
  await mt.append('splits', {
    account: expenseA,
    amount: fyo.pesa(3000),
    description: 'gross salary',
  });
  await mt.append('splits', {
    account: fedWithholding,
    amount: fyo.pesa(-400),
  });
  await mt.append('splits', {
    account: stateWithholding,
    amount: fyo.pesa(-150),
  });
  await mt.append('splits', {
    account: localWithholding,
    amount: fyo.pesa(-50),
  });
  await mt.sync();

  // Signs must survive the Currency round-trip through the database.
  const raw = (await fyo.db.getAllRaw(ModelNameEnum.PaymentSplit, {
    fields: ['account', 'amount'],
    filters: { parent: mt.name as string },
  })) as { account: string; amount: string }[];
  t.equal(raw.length, 4, 'four split rows stored');
  const rawFed = raw.find((r) => r.account === fedWithholding);
  t.equal(
    fyo.pesa(rawFed?.amount ?? 0).float,
    -400,
    'negative amount round-trips through the database'
  );

  const payment = await createPaymentFromMemorized(fyo, mt);
  const ales = await alesForReference(payment.name!);
  const cash = net(ales, cashAccount);
  const salary = net(ales, expenseA);
  const fed = net(ales, fedWithholding);
  const state = net(ales, stateWithholding);
  const local = net(ales, localWithholding);

  t.equal(cash.credit, 2400, 'replayed Cash credit is the net amount');
  t.equal(salary.debit, 3000, 'replayed salary debit is gross');
  t.equal(fed.credit, 400, 'replayed federal withholding credit');
  t.equal(state.credit, 150, 'replayed state withholding credit');
  t.equal(local.credit, 50, 'replayed local withholding credit');

  const totalDebit = ales.reduce((s, x) => s + x.debit, 0);
  const totalCredit = ales.reduce((s, x) => s + x.credit, 0);
  t.equal(totalDebit, totalCredit, 'replayed ledger balances');
});

test('no splits: payment posts exactly as before', async (t) => {
  const payment = getSplitPayment('Pay', 100);
  await payment.sync();
  await payment.submit();

  const ales = await alesForReference(payment.name!);
  const cash = net(ales, cashAccount);
  const a = net(ales, expenseA);

  t.equal(cash.credit, 100, 'Cash is credited the full amount');
  t.equal(a.debit, 100, 'category account is debited the full amount');
  t.equal(ales.length, 2, 'exactly two ledger entries');
});

closeTestFyo(fyo, __filename);
