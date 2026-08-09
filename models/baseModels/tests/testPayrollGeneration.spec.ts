import test from 'tape';
import { closeTestFyo, getTestFyo, setupTestFyo } from 'tests/helpers';
import { ModelNameEnum } from 'models/types';
import { ValidationError } from 'fyo/utils/errors';
import { createNumberSeries } from 'fyo/model/naming';
import { DEFAULT_SERIES_START } from 'fyo/utils/consts';
import { generatePayRunPayments, PAYROLL_MEMO } from 'src/utils/payrollPayRun';

/**
 * Pay Run generation over PayrollProfile docs:
 * - one Payment-with-splits per employee posting gross wages Dr,
 *   deduction liabilities Cr, net to bank Cr;
 * - all lines are pre-validated so a bad line creates nothing;
 * - a duplicate-run guard blocks re-paying the same employee on the
 *   same pay date.
 */

const fyo = getTestFyo();
setupTestFyo(fyo, __filename);

const methodName = 'PR Cash';
const PAY_DATE = '2026-08-07';
let empOne = '';
let empTwo = '';
let cashAccount = '';
let salaryExpense = '';
let fedWithholding = '';
let healthWithholding = '';
let profileOne = '';
let profileTwo = '';

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

async function payrollPaymentCount(): Promise<number> {
  const rows = await fyo.db.getAll(ModelNameEnum.Payment, {
    fields: ['name'],
    filters: { memo: PAYROLL_MEMO, submitted: true, cancelled: false },
  });
  return rows.length;
}

test('payroll generation setup: employees, accounts, profiles', async (t) => {
  await createNumberSeries(
    'PAY-',
    ModelNameEnum.Payment,
    DEFAULT_SERIES_START,
    fyo
  );

  for (const [label, setter] of [
    ['Payroll Emp One', (id: string) => (empOne = id)],
    ['Payroll Emp Two', (id: string) => (empTwo = id)],
  ] as const) {
    const doc = await fyo.doc
      .getNewDoc(ModelNameEnum.Party, {
        partyName: label,
        role: 'Employee',
      })
      .sync();
    setter(doc.name as string);
  }
  t.ok(empOne && empTwo, 'employee parties exist');

  const expenseGroups = (await fyo.db.getAll(ModelNameEnum.Account, {
    filters: { isGroup: true, rootType: 'Expense' },
    fields: ['name'],
  })) as { name: string }[];
  const liabilityGroups = (await fyo.db.getAll(ModelNameEnum.Account, {
    filters: { isGroup: true, rootType: 'Liability' },
    fields: ['name'],
  })) as { name: string }[];
  const assetGroups = (await fyo.db.getAll(ModelNameEnum.Account, {
    filters: { isGroup: true, rootType: 'Asset' },
    fields: ['name'],
  })) as { name: string }[];
  t.ok(
    expenseGroups.length && liabilityGroups.length && assetGroups.length,
    'group accounts exist'
  );

  const salaryDoc = fyo.doc.getNewDoc(ModelNameEnum.Account, {
    name: 'PR Salary Expense',
    accountName: 'PR Salary Expense',
    rootType: 'Expense',
    parentAccount: expenseGroups[0].name,
    isGroup: false,
  });
  await salaryDoc.sync();
  salaryExpense = salaryDoc.name as string;

  for (const [label, setter] of [
    ['PR Fed WH', (id: string) => (fedWithholding = id)],
    ['PR Health WH', (id: string) => (healthWithholding = id)],
  ] as const) {
    const doc = fyo.doc.getNewDoc(ModelNameEnum.Account, {
      name: label,
      accountName: label,
      rootType: 'Liability',
      parentAccount: liabilityGroups[0].name,
      isGroup: false,
    });
    await doc.sync();
    setter(doc.name as string);
  }

  const cashDoc = fyo.doc.getNewDoc(ModelNameEnum.Account, {
    name: 'PR Test Cash',
    accountName: 'PR Test Cash',
    rootType: 'Asset',
    accountType: 'Cash',
    parentAccount: assetGroups[0].name,
    isGroup: false,
  });
  await cashDoc.sync();
  cashAccount = cashDoc.name as string;
  t.ok(
    salaryExpense && fedWithholding && healthWithholding && cashAccount,
    'payroll accounts exist'
  );

  await fyo.doc
    .getNewDoc(ModelNameEnum.PaymentMethod, { name: methodName, type: 'Cash' })
    .sync();

  // Salary 3000: 10% federal (300) + 100 fixed health = net 2600.
  const pOne = fyo.doc.getNewDoc(ModelNameEnum.PayrollProfile, {
    party: empOne,
    payType: 'Salary',
    rate: fyo.pesa(3000),
    expenseAccount: salaryExpense,
  });
  await pOne.append('deductions', {
    account: fedWithholding,
    deductionType: 'Percent',
    amount: fyo.pesa(10),
    description: 'FIT',
  });
  await pOne.append('deductions', {
    account: healthWithholding,
    deductionType: 'Fixed',
    amount: fyo.pesa(100),
    description: 'Health',
  });
  await pOne.sync();
  profileOne = pOne.name as string;

  // Hourly 25/h: 40h = 1000 gross, 50 fixed = net 950.
  const pTwo = fyo.doc.getNewDoc(ModelNameEnum.PayrollProfile, {
    party: empTwo,
    payType: 'Hourly',
    rate: fyo.pesa(25),
    expenseAccount: salaryExpense,
  });
  await pTwo.append('deductions', {
    account: fedWithholding,
    deductionType: 'Fixed',
    amount: fyo.pesa(50),
  });
  await pTwo.sync();
  profileTwo = pTwo.name as string;

  t.ok(profileOne && profileTwo, 'payroll profiles exist');
});

test('profile validation: duplicate party, bad rate, bad deductions reject', async (t) => {
  const duplicate = fyo.doc.getNewDoc(ModelNameEnum.PayrollProfile, {
    party: empOne,
    payType: 'Salary',
    rate: fyo.pesa(1),
    expenseAccount: salaryExpense,
  });
  try {
    await duplicate.sync();
    t.fail('sync should have thrown for a second profile on the same party');
  } catch (error) {
    t.ok(
      error instanceof ValidationError,
      'duplicate-party profile throws ValidationError'
    );
  }

  const overPercent = fyo.doc.getNewDoc(ModelNameEnum.PayrollProfile, {
    party: empTwo,
    payType: 'Salary',
    rate: fyo.pesa(1000),
    expenseAccount: salaryExpense,
  });
  await overPercent.append('deductions', {
    account: fedWithholding,
    deductionType: 'Percent',
    amount: fyo.pesa(150),
  });
  try {
    await overPercent.sync();
    t.fail('sync should have thrown for a percent deduction above 100');
  } catch (error) {
    t.ok(
      error instanceof ValidationError,
      'percent deduction above 100 throws ValidationError'
    );
  }
});

test('pay run posts gross Dr, deduction liabilities Cr, net to bank Cr', async (t) => {
  const payments = await generatePayRunPayments(fyo, {
    payDate: PAY_DATE,
    bankAccount: cashAccount,
    paymentMethod: methodName,
    lines: [
      { profileName: profileOne },
      { profileName: profileTwo, hours: 40 },
    ],
  });
  t.equal(payments.length, 2, 'one payment per employee');

  const [payOne, payTwo] = payments;
  t.equal(payOne.party, empOne, 'payment one goes to the exact party id');
  t.equal(payTwo.party, empTwo, 'payment two goes to the exact party id');

  const alesOne = await alesForReference(payOne.name!);
  t.equal(
    net(alesOne, salaryExpense).debit,
    3000,
    'salary expense debited gross (3000)'
  );
  t.equal(
    net(alesOne, fedWithholding).credit,
    300,
    'federal deduction credited (300)'
  );
  t.equal(
    net(alesOne, healthWithholding).credit,
    100,
    'health deduction credited (100)'
  );
  t.equal(
    net(alesOne, cashAccount).credit,
    2600,
    'bank credited the net paycheck (2600)'
  );
  const debitOne = alesOne.reduce((s, x) => s + x.debit, 0);
  const creditOne = alesOne.reduce((s, x) => s + x.credit, 0);
  t.equal(debitOne, creditOne, 'employee one ledger balances');

  const alesTwo = await alesForReference(payTwo.name!);
  t.equal(
    net(alesTwo, salaryExpense).debit,
    1000,
    'hourly gross debited (25 x 40 = 1000)'
  );
  t.equal(
    net(alesTwo, fedWithholding).credit,
    50,
    'fixed deduction credited (50)'
  );
  t.equal(
    net(alesTwo, cashAccount).credit,
    950,
    'bank credited hourly net (950)'
  );

  t.equal(await payrollPaymentCount(), 2, 'two payroll payments exist');
});

test('duplicate-run guard blocks a second identical run', async (t) => {
  try {
    await generatePayRunPayments(fyo, {
      payDate: PAY_DATE,
      bankAccount: cashAccount,
      paymentMethod: methodName,
      lines: [
        { profileName: profileOne },
        { profileName: profileTwo, hours: 40 },
      ],
    });
    t.fail('second run on the same pay date should have thrown');
  } catch (error) {
    t.match(
      (error as Error).message,
      /Already paid/,
      'guard names the already-paid employees'
    );
  }
  t.equal(await payrollPaymentCount(), 2, 'no extra payments were created');

  // A different pay date is allowed for the same employees.
  const rerun = await generatePayRunPayments(fyo, {
    payDate: '2026-08-14',
    bankAccount: cashAccount,
    paymentMethod: methodName,
    lines: [{ profileName: profileTwo, hours: 8 }],
  });
  t.equal(rerun.length, 1, 'a later pay date posts normally');
  t.equal(await payrollPaymentCount(), 3, 'rerun added exactly one payment');
});

test('a bad line means no payments are created at all', async (t) => {
  const before = await payrollPaymentCount();
  try {
    await generatePayRunPayments(fyo, {
      payDate: '2026-08-21',
      bankAccount: cashAccount,
      paymentMethod: methodName,
      // profileOne is valid; profileTwo is hourly with missing hours.
      lines: [{ profileName: profileOne }, { profileName: profileTwo }],
    });
    t.fail('run with a bad line should have thrown');
  } catch (error) {
    t.match(
      (error as Error).message,
      /No payments were created/,
      'error states nothing was created'
    );
    t.match(
      (error as Error).message,
      /Hours are required/,
      'error carries the per-line reason'
    );
  }
  t.equal(
    await payrollPaymentCount(),
    before,
    'valid lines were not posted alongside the bad one'
  );
});

closeTestFyo(fyo, __filename);
