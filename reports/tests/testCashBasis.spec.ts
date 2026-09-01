import test from 'tape';
import { ModelNameEnum } from 'models/types';
import {
  allocatedBaseAmount,
  csvBasisHeader,
  injectSyntheticCashBasisAccounts,
  isSyntheticCashBasisAccount,
  PartyAccountKind,
  transformToCashBasis,
  UNAPPLIED_CASH_EXPENSE,
  UNAPPLIED_CASH_INCOME,
} from 'reports/cashBasis';
import { Account, LedgerEntry } from 'reports/types';

const PARTY = new Map<string, PartyAccountKind>([
  ['Debtors', 'Receivable'],
  ['Creditors', 'Payable'],
]);
const PAY_DATE = new Date('2026-03-15');
const INV_DATE = new Date('2026-01-10');

function ale(partial: Partial<LedgerEntry>): LedgerEntry {
  return {
    name: 1,
    account: 'Sales',
    date: INV_DATE,
    debit: 0,
    credit: 0,
    balance: 0,
    referenceType: ModelNameEnum.SalesInvoice,
    referenceName: 'SINV-1',
    party: 'Alice',
    reverted: false,
    reverts: '',
    ...partial,
  };
}

function net(entries: LedgerEntry[], account: string): number {
  return entries
    .filter((entry) => entry.account === account)
    .reduce((sum, entry) => sum + (entry.debit ?? 0) - (entry.credit ?? 0), 0);
}

function signedNet(entries: LedgerEntry[]): number {
  return entries.reduce(
    (sum, entry) => sum + (entry.debit ?? 0) - (entry.credit ?? 0),
    0
  );
}

test('cash basis drops unpaid invoice legs', (t) => {
  const out = transformToCashBasis({
    entries: [
      ale({ account: 'Debtors', debit: 100, credit: 0 }),
      ale({ account: 'Sales', debit: 0, credit: 100 }),
    ],
    payments: [],
    paymentFor: [],
    invoiceEntries: [],
    invoices: [],
    partyAccounts: PARTY,
  });
  t.equal(out.length, 0);
  t.end();
});

test('full payment re-emits invoice income on payment date', (t) => {
  const invoiceLegs = [
    ale({ account: 'Debtors', debit: 100, credit: 0 }),
    ale({ account: 'Sales', debit: 0, credit: 100 }),
  ];
  const out = transformToCashBasis({
    entries: [
      ...invoiceLegs,
      ale({
        name: 3,
        account: 'Cash',
        date: PAY_DATE,
        debit: 100,
        credit: 0,
        referenceType: ModelNameEnum.Payment,
        referenceName: 'PAY-1',
      }),
      ale({
        name: 4,
        account: 'Debtors',
        date: PAY_DATE,
        debit: 0,
        credit: 100,
        referenceType: ModelNameEnum.Payment,
        referenceName: 'PAY-1',
      }),
    ],
    payments: [
      { name: 'PAY-1', date: PAY_DATE, paymentType: 'Receive', amount: 100 },
    ],
    paymentFor: [
      {
        parent: 'PAY-1',
        referenceType: ModelNameEnum.SalesInvoice,
        referenceName: 'SINV-1',
        amount: 100,
      },
    ],
    invoiceEntries: invoiceLegs,
    invoices: [
      {
        name: 'SINV-1',
        schemaName: ModelNameEnum.SalesInvoice,
        baseGrandTotal: 100,
        exchangeRate: 1,
      },
    ],
    partyAccounts: PARTY,
  });

  t.equal(net(out, 'Debtors'), 0, 'AR dropped');
  t.equal(net(out, 'Cash'), 100, 'cash kept');
  t.equal(net(out, 'Sales'), -100, 'income recognized');
  t.ok(
    out.every(
      (entry) =>
        entry.account !== 'Sales' ||
        entry.date?.toISOString() === PAY_DATE.toISOString()
    ),
    'income dated on payment'
  );
  t.equal(round(signedNet(out)), 0, 'payment stays balanced');
  t.end();
});

test('partial payment scales income by allocated ratio', (t) => {
  const invoiceLegs = [
    ale({ account: 'Debtors', debit: 100, credit: 0 }),
    ale({ account: 'Sales', debit: 0, credit: 80 }),
    ale({ account: 'Tax', debit: 0, credit: 20 }),
  ];
  const out = transformToCashBasis({
    entries: [
      ale({
        account: 'Cash',
        date: PAY_DATE,
        debit: 40,
        credit: 0,
        referenceType: ModelNameEnum.Payment,
        referenceName: 'PAY-1',
      }),
      ale({
        account: 'Debtors',
        date: PAY_DATE,
        debit: 0,
        credit: 40,
        referenceType: ModelNameEnum.Payment,
        referenceName: 'PAY-1',
      }),
    ],
    payments: [
      { name: 'PAY-1', date: PAY_DATE, paymentType: 'Receive', amount: 40 },
    ],
    paymentFor: [
      {
        parent: 'PAY-1',
        referenceType: ModelNameEnum.SalesInvoice,
        referenceName: 'SINV-1',
        amount: 40,
      },
    ],
    invoiceEntries: invoiceLegs,
    invoices: [
      {
        name: 'SINV-1',
        schemaName: ModelNameEnum.SalesInvoice,
        baseGrandTotal: 100,
        exchangeRate: 1,
      },
    ],
    partyAccounts: PARTY,
  });

  t.equal(net(out, 'Sales'), -32);
  t.equal(net(out, 'Tax'), -8);
  t.equal(round(signedNet(out)), 0);
  t.end();
});

test('one payment across two invoices splits recognition', (t) => {
  const out = transformToCashBasis({
    entries: [
      ale({
        account: 'Cash',
        date: PAY_DATE,
        debit: 150,
        credit: 0,
        referenceType: ModelNameEnum.Payment,
        referenceName: 'PAY-1',
      }),
      ale({
        account: 'Debtors',
        date: PAY_DATE,
        debit: 0,
        credit: 150,
        referenceType: ModelNameEnum.Payment,
        referenceName: 'PAY-1',
      }),
    ],
    payments: [
      { name: 'PAY-1', date: PAY_DATE, paymentType: 'Receive', amount: 150 },
    ],
    paymentFor: [
      {
        parent: 'PAY-1',
        referenceType: ModelNameEnum.SalesInvoice,
        referenceName: 'SINV-1',
        amount: 100,
      },
      {
        parent: 'PAY-1',
        referenceType: ModelNameEnum.SalesInvoice,
        referenceName: 'SINV-2',
        amount: 50,
      },
    ],
    invoiceEntries: [
      ale({
        account: 'Debtors',
        debit: 100,
        credit: 0,
        referenceName: 'SINV-1',
      }),
      ale({ account: 'Sales', debit: 0, credit: 100, referenceName: 'SINV-1' }),
      ale({
        account: 'Debtors',
        debit: 50,
        credit: 0,
        referenceName: 'SINV-2',
      }),
      ale({
        account: 'Service',
        debit: 0,
        credit: 50,
        referenceName: 'SINV-2',
      }),
    ],
    invoices: [
      {
        name: 'SINV-1',
        schemaName: ModelNameEnum.SalesInvoice,
        baseGrandTotal: 100,
        exchangeRate: 1,
      },
      {
        name: 'SINV-2',
        schemaName: ModelNameEnum.SalesInvoice,
        baseGrandTotal: 50,
        exchangeRate: 1,
      },
    ],
    partyAccounts: PARTY,
  });

  t.equal(net(out, 'Sales'), -100);
  t.equal(net(out, 'Service'), -50);
  t.equal(round(signedNet(out)), 0);
  t.end();
});

test('write-off keeps expense and recognizes full allocated income', (t) => {
  const invoiceLegs = [
    ale({ account: 'Debtors', debit: 157.5, credit: 0 }),
    ale({ account: 'Sales', debit: 0, credit: 157.5 }),
  ];
  const out = transformToCashBasis({
    entries: [
      ale({
        account: 'Cash',
        date: PAY_DATE,
        debit: 155,
        credit: 0,
        referenceType: ModelNameEnum.Payment,
        referenceName: 'PAY-1',
      }),
      ale({
        account: 'Write Off',
        date: PAY_DATE,
        debit: 2.5,
        credit: 0,
        referenceType: ModelNameEnum.Payment,
        referenceName: 'PAY-1',
      }),
      ale({
        account: 'Debtors',
        date: PAY_DATE,
        debit: 0,
        credit: 157.5,
        referenceType: ModelNameEnum.Payment,
        referenceName: 'PAY-1',
      }),
    ],
    payments: [
      { name: 'PAY-1', date: PAY_DATE, paymentType: 'Receive', amount: 157.5 },
    ],
    paymentFor: [
      {
        parent: 'PAY-1',
        referenceType: ModelNameEnum.SalesInvoice,
        referenceName: 'SINV-1',
        amount: 157.5,
      },
    ],
    invoiceEntries: invoiceLegs,
    invoices: [
      {
        name: 'SINV-1',
        schemaName: ModelNameEnum.SalesInvoice,
        baseGrandTotal: 157.5,
        exchangeRate: 1,
      },
    ],
    partyAccounts: PARTY,
  });

  t.equal(net(out, 'Cash'), 155);
  t.equal(net(out, 'Write Off'), 2.5);
  t.equal(net(out, 'Sales'), -157.5);
  t.equal(round(signedNet(out)), 0, 'net P&L equals cash after write-off');
  t.end();
});

test('unallocated payment lands in Unapplied Cash Payment Income', (t) => {
  const out = transformToCashBasis({
    entries: [
      ale({
        account: 'Cash',
        date: PAY_DATE,
        debit: 80,
        credit: 0,
        referenceType: ModelNameEnum.Payment,
        referenceName: 'PAY-1',
      }),
      ale({
        account: 'Debtors',
        date: PAY_DATE,
        debit: 0,
        credit: 80,
        referenceType: ModelNameEnum.Payment,
        referenceName: 'PAY-1',
      }),
    ],
    payments: [
      { name: 'PAY-1', date: PAY_DATE, paymentType: 'Receive', amount: 80 },
    ],
    paymentFor: [],
    invoiceEntries: [],
    invoices: [],
    partyAccounts: PARTY,
  });

  t.equal(net(out, UNAPPLIED_CASH_INCOME), -80);
  t.equal(net(out, 'Debtors'), 0);
  t.end();
});

test('unallocated vendor payment lands in Unapplied Cash Payment Expense', (t) => {
  const out = transformToCashBasis({
    entries: [
      ale({
        account: 'Creditors',
        date: PAY_DATE,
        debit: 25,
        credit: 0,
        referenceType: ModelNameEnum.Payment,
        referenceName: 'PAY-2',
      }),
      ale({
        account: 'Cash',
        date: PAY_DATE,
        debit: 0,
        credit: 25,
        referenceType: ModelNameEnum.Payment,
        referenceName: 'PAY-2',
      }),
    ],
    payments: [
      { name: 'PAY-2', date: PAY_DATE, paymentType: 'Pay', amount: 25 },
    ],
    paymentFor: [],
    invoiceEntries: [],
    invoices: [],
    partyAccounts: PARTY,
  });

  t.equal(net(out, UNAPPLIED_CASH_EXPENSE), 25);
  t.end();
});

test('split-register payments with no party leg pass through', (t) => {
  const splits = [
    ale({
      account: 'Office Expense',
      date: PAY_DATE,
      debit: 40,
      credit: 0,
      referenceType: ModelNameEnum.Payment,
      referenceName: 'PAY-3',
    }),
    ale({
      account: 'Cash',
      date: PAY_DATE,
      debit: 0,
      credit: 40,
      referenceType: ModelNameEnum.Payment,
      referenceName: 'PAY-3',
    }),
  ];
  const out = transformToCashBasis({
    entries: splits,
    payments: [
      { name: 'PAY-3', date: PAY_DATE, paymentType: 'Pay', amount: 40 },
    ],
    paymentFor: [],
    invoiceEntries: [],
    invoices: [],
    partyAccounts: PARTY,
  });

  t.equal(out.length, 2);
  t.equal(net(out, 'Office Expense'), 40);
  t.end();
});

test('journal entries and stock legs pass through', (t) => {
  const out = transformToCashBasis({
    entries: [
      ale({
        account: 'Cash',
        debit: 10,
        credit: 0,
        referenceType: ModelNameEnum.JournalEntry,
        referenceName: 'JE-1',
      }),
      ale({
        account: 'Cost of Goods Sold',
        debit: 12,
        credit: 0,
        referenceType: 'Shipment',
        referenceName: 'SHIP-1',
      }),
    ],
    payments: [],
    paymentFor: [],
    invoiceEntries: [],
    invoices: [],
    partyAccounts: PARTY,
  });
  t.equal(out.length, 2);
  t.end();
});

test('return invoice refund flips income on payment date', (t) => {
  const invoiceLegs = [
    ale({ account: 'Debtors', debit: 0, credit: 50 }),
    ale({ account: 'Sales', debit: 50, credit: 0 }),
  ];
  const out = transformToCashBasis({
    entries: [
      ale({
        account: 'Debtors',
        date: PAY_DATE,
        debit: 50,
        credit: 0,
        referenceType: ModelNameEnum.Payment,
        referenceName: 'PAY-R',
      }),
      ale({
        account: 'Cash',
        date: PAY_DATE,
        debit: 0,
        credit: 50,
        referenceType: ModelNameEnum.Payment,
        referenceName: 'PAY-R',
      }),
    ],
    payments: [
      { name: 'PAY-R', date: PAY_DATE, paymentType: 'Pay', amount: 50 },
    ],
    paymentFor: [
      {
        parent: 'PAY-R',
        referenceType: ModelNameEnum.SalesInvoice,
        referenceName: 'SINV-1',
        amount: 50,
      },
    ],
    invoiceEntries: invoiceLegs,
    invoices: [
      {
        name: 'SINV-1',
        schemaName: ModelNameEnum.SalesInvoice,
        baseGrandTotal: 50,
        exchangeRate: 1,
      },
    ],
    partyAccounts: PARTY,
  });

  t.equal(net(out, 'Sales'), 50, 'income reversed');
  t.equal(net(out, 'Cash'), -50);
  t.end();
});

test('reverted entries are ignored when omitted from input', (t) => {
  const out = transformToCashBasis({
    entries: [],
    payments: [],
    paymentFor: [],
    invoiceEntries: [
      ale({ account: 'Sales', debit: 0, credit: 100, reverted: true }),
    ],
    invoices: [],
    partyAccounts: PARTY,
  });
  t.equal(out.length, 0);
  t.end();
});

test('FX allocation uses base grand total', (t) => {
  const invoiceLegs = [
    ale({ account: 'Debtors', debit: 200, credit: 0 }),
    ale({ account: 'Sales', debit: 0, credit: 200 }),
  ];
  const out = transformToCashBasis({
    entries: [
      ale({
        account: 'Cash',
        date: PAY_DATE,
        debit: 200,
        credit: 0,
        referenceType: ModelNameEnum.Payment,
        referenceName: 'PAY-1',
      }),
      ale({
        account: 'Debtors',
        date: PAY_DATE,
        debit: 0,
        credit: 200,
        referenceType: ModelNameEnum.Payment,
        referenceName: 'PAY-1',
      }),
    ],
    payments: [
      { name: 'PAY-1', date: PAY_DATE, paymentType: 'Receive', amount: 200 },
    ],
    paymentFor: [
      {
        parent: 'PAY-1',
        referenceType: ModelNameEnum.SalesInvoice,
        referenceName: 'SINV-1',
        amount: 200,
      },
    ],
    invoiceEntries: invoiceLegs,
    invoices: [
      {
        name: 'SINV-1',
        schemaName: ModelNameEnum.SalesInvoice,
        baseGrandTotal: 200,
        exchangeRate: 2,
      },
    ],
    partyAccounts: PARTY,
  });
  t.equal(net(out, 'Sales'), -200);
  t.end();
});

test('FX PaymentFor amounts are treated as base (no currency guess)', (t) => {
  t.equal(
    allocatedBaseAmount(100, { baseGrandTotal: 200, exchangeRate: 2 }),
    100,
    'does not treat a foreign-looking amount as invoice currency'
  );
  t.equal(
    allocatedBaseAmount(200, { baseGrandTotal: 200, exchangeRate: 2 }),
    200,
    'already-base amount stays 200'
  );
  t.equal(
    allocatedBaseAmount(400, { baseGrandTotal: 1000, exchangeRate: 2 }),
    400,
    'base-currency partial is not doubled'
  );
  t.equal(
    allocatedBaseAmount(500, { baseGrandTotal: 1000, exchangeRate: 2 }),
    500,
    '50% base partial that equals the foreign total is not doubled'
  );
  t.end();
});

test('invoice plus return on one payment has no phantom unapplied', (t) => {
  const out = transformToCashBasis({
    entries: [
      ale({
        account: 'Cash',
        date: PAY_DATE,
        debit: 50,
        credit: 0,
        referenceType: ModelNameEnum.Payment,
        referenceName: 'PAY-1',
      }),
      ale({
        account: 'Debtors',
        date: PAY_DATE,
        debit: 0,
        credit: 50,
        referenceType: ModelNameEnum.Payment,
        referenceName: 'PAY-1',
      }),
    ],
    payments: [
      { name: 'PAY-1', date: PAY_DATE, paymentType: 'Receive', amount: 50 },
    ],
    paymentFor: [
      {
        parent: 'PAY-1',
        referenceType: ModelNameEnum.SalesInvoice,
        referenceName: 'SINV-1',
        amount: 100,
      },
      {
        parent: 'PAY-1',
        referenceType: ModelNameEnum.SalesInvoice,
        referenceName: 'SINV-R',
        amount: -50,
      },
    ],
    invoiceEntries: [
      ale({
        account: 'Debtors',
        debit: 100,
        credit: 0,
        referenceName: 'SINV-1',
      }),
      ale({ account: 'Sales', debit: 0, credit: 100, referenceName: 'SINV-1' }),
      ale({
        account: 'Debtors',
        debit: 0,
        credit: 50,
        referenceName: 'SINV-R',
      }),
      ale({ account: 'Sales', debit: 50, credit: 0, referenceName: 'SINV-R' }),
    ],
    invoices: [
      {
        name: 'SINV-1',
        schemaName: ModelNameEnum.SalesInvoice,
        baseGrandTotal: 100,
        exchangeRate: 1,
      },
      {
        name: 'SINV-R',
        schemaName: ModelNameEnum.SalesInvoice,
        baseGrandTotal: -50,
        exchangeRate: 1,
      },
    ],
    partyAccounts: PARTY,
  });

  t.equal(net(out, 'Sales'), -50);
  t.equal(net(out, UNAPPLIED_CASH_INCOME), 0);
  t.equal(round(signedNet(out)), 0);
  t.end();
});

test('unallocated customer refund hits Unapplied Income not Expense', (t) => {
  const out = transformToCashBasis({
    entries: [
      ale({
        account: 'Debtors',
        date: PAY_DATE,
        debit: 80,
        credit: 0,
        referenceType: ModelNameEnum.Payment,
        referenceName: 'PAY-RF',
      }),
      ale({
        account: 'Cash',
        date: PAY_DATE,
        debit: 0,
        credit: 80,
        referenceType: ModelNameEnum.Payment,
        referenceName: 'PAY-RF',
      }),
    ],
    payments: [
      { name: 'PAY-RF', date: PAY_DATE, paymentType: 'Pay', amount: 80 },
    ],
    paymentFor: [],
    invoiceEntries: [],
    invoices: [],
    partyAccounts: PARTY,
  });

  t.equal(net(out, UNAPPLIED_CASH_INCOME), 80);
  t.equal(net(out, UNAPPLIED_CASH_EXPENSE), 0);
  t.equal(round(signedNet(out)), 0);
  t.end();
});

test('rounding drift is renormalized onto the largest leg', (t) => {
  const invoiceLegs = [
    ale({ account: 'Debtors', debit: 100, credit: 0 }),
    ale({ account: 'Sales A', debit: 0, credit: 33.33 }),
    ale({ account: 'Sales B', debit: 0, credit: 33.33 }),
    ale({ account: 'Sales C', debit: 0, credit: 33.34 }),
  ];
  const out = transformToCashBasis({
    entries: [
      ale({
        account: 'Cash',
        date: PAY_DATE,
        debit: 10,
        credit: 0,
        referenceType: ModelNameEnum.Payment,
        referenceName: 'PAY-1',
      }),
      ale({
        account: 'Debtors',
        date: PAY_DATE,
        debit: 0,
        credit: 10,
        referenceType: ModelNameEnum.Payment,
        referenceName: 'PAY-1',
      }),
    ],
    payments: [
      { name: 'PAY-1', date: PAY_DATE, paymentType: 'Receive', amount: 10 },
    ],
    paymentFor: [
      {
        parent: 'PAY-1',
        referenceType: ModelNameEnum.SalesInvoice,
        referenceName: 'SINV-1',
        amount: 10,
      },
    ],
    invoiceEntries: invoiceLegs,
    invoices: [
      {
        name: 'SINV-1',
        schemaName: ModelNameEnum.SalesInvoice,
        baseGrandTotal: 100,
        exchangeRate: 1,
      },
    ],
    partyAccounts: PARTY,
  });

  t.equal(round(signedNet(out)), 0);
  t.equal(
    round(net(out, 'Sales A') + net(out, 'Sales B') + net(out, 'Sales C')),
    -10
  );
  t.end();
});

test('same-day invoice plus payment matches accrual income', (t) => {
  const sameDay = new Date('2026-06-01');
  const invoiceLegs = [
    ale({ account: 'Debtors', date: sameDay, debit: 75, credit: 0 }),
    ale({ account: 'Sales', date: sameDay, debit: 0, credit: 75 }),
  ];
  const out = transformToCashBasis({
    entries: [
      ...invoiceLegs,
      ale({
        account: 'Cash',
        date: sameDay,
        debit: 75,
        credit: 0,
        referenceType: ModelNameEnum.Payment,
        referenceName: 'PAY-1',
      }),
      ale({
        account: 'Debtors',
        date: sameDay,
        debit: 0,
        credit: 75,
        referenceType: ModelNameEnum.Payment,
        referenceName: 'PAY-1',
      }),
    ],
    payments: [
      { name: 'PAY-1', date: sameDay, paymentType: 'Receive', amount: 75 },
    ],
    paymentFor: [
      {
        parent: 'PAY-1',
        referenceType: ModelNameEnum.SalesInvoice,
        referenceName: 'SINV-1',
        amount: 75,
      },
    ],
    invoiceEntries: invoiceLegs,
    invoices: [
      {
        name: 'SINV-1',
        schemaName: ModelNameEnum.SalesInvoice,
        baseGrandTotal: 75,
        exchangeRate: 1,
      },
    ],
    partyAccounts: PARTY,
  });

  t.equal(net(out, 'Sales'), -75);
  t.equal(net(invoiceLegs, 'Sales'), -75);
  t.end();
});

test('cloned income uses payment ALE date not Payment.date', (t) => {
  const aleDate = new Date('2026-03-20');
  const invoiceLegs = [
    ale({ account: 'Debtors', debit: 100, credit: 0 }),
    ale({ account: 'Sales', debit: 0, credit: 100 }),
  ];
  const out = transformToCashBasis({
    entries: [
      ale({
        name: 3,
        account: 'Cash',
        date: aleDate,
        debit: 100,
        credit: 0,
        referenceType: ModelNameEnum.Payment,
        referenceName: 'PAY-1',
      }),
      ale({
        name: 4,
        account: 'Debtors',
        date: aleDate,
        debit: 0,
        credit: 100,
        referenceType: ModelNameEnum.Payment,
        referenceName: 'PAY-1',
      }),
    ],
    payments: [
      { name: 'PAY-1', date: PAY_DATE, paymentType: 'Receive', amount: 100 },
    ],
    paymentFor: [
      {
        parent: 'PAY-1',
        referenceType: ModelNameEnum.SalesInvoice,
        referenceName: 'SINV-1',
        amount: 100,
      },
    ],
    invoiceEntries: invoiceLegs,
    invoices: [
      {
        name: 'SINV-1',
        schemaName: ModelNameEnum.SalesInvoice,
        baseGrandTotal: 100,
        exchangeRate: 1,
      },
    ],
    partyAccounts: PARTY,
  });

  const sales = out.find((entry) => entry.account === 'Sales');
  t.equal(sales?.date?.toISOString(), aleDate.toISOString());
  t.end();
});

test('loyalty expense legs are excluded and remainder goes unapplied', (t) => {
  const invoiceLegs = [
    ale({ account: 'Debtors', debit: 90, credit: 0 }),
    ale({ account: 'Sales', debit: 0, credit: 100 }),
    ale({ account: 'Loyalty Expense', debit: 10, credit: 0 }),
  ];
  const out = transformToCashBasis({
    entries: [
      ale({
        account: 'Cash',
        date: PAY_DATE,
        debit: 90,
        credit: 0,
        referenceType: ModelNameEnum.Payment,
        referenceName: 'PAY-1',
      }),
      ale({
        account: 'Debtors',
        date: PAY_DATE,
        debit: 0,
        credit: 90,
        referenceType: ModelNameEnum.Payment,
        referenceName: 'PAY-1',
      }),
    ],
    payments: [
      { name: 'PAY-1', date: PAY_DATE, paymentType: 'Receive', amount: 90 },
    ],
    paymentFor: [
      {
        parent: 'PAY-1',
        referenceType: ModelNameEnum.SalesInvoice,
        referenceName: 'SINV-1',
        amount: 90,
      },
    ],
    invoiceEntries: invoiceLegs,
    invoices: [
      {
        name: 'SINV-1',
        schemaName: ModelNameEnum.SalesInvoice,
        baseGrandTotal: 90,
        exchangeRate: 1,
      },
    ],
    partyAccounts: PARTY,
    excludeAccounts: new Set(['Loyalty Expense']),
  });

  t.equal(net(out, 'Sales'), -100);
  t.equal(net(out, 'Loyalty Expense'), 0);
  t.equal(net(out, UNAPPLIED_CASH_INCOME), 10);
  t.equal(round(signedNet(out)), 0);
  t.end();
});

test('sales and purchase invoices with the same name do not mix legs', (t) => {
  const out = transformToCashBasis({
    entries: [
      ale({
        account: 'Cash',
        date: PAY_DATE,
        debit: 100,
        credit: 0,
        referenceType: ModelNameEnum.Payment,
        referenceName: 'PAY-1',
      }),
      ale({
        account: 'Debtors',
        date: PAY_DATE,
        debit: 0,
        credit: 100,
        referenceType: ModelNameEnum.Payment,
        referenceName: 'PAY-1',
      }),
    ],
    payments: [
      { name: 'PAY-1', date: PAY_DATE, paymentType: 'Receive', amount: 100 },
    ],
    paymentFor: [
      {
        parent: 'PAY-1',
        referenceType: ModelNameEnum.SalesInvoice,
        referenceName: 'DOC-1',
        amount: 100,
      },
    ],
    invoiceEntries: [
      ale({
        account: 'Debtors',
        debit: 100,
        credit: 0,
        referenceType: ModelNameEnum.SalesInvoice,
        referenceName: 'DOC-1',
      }),
      ale({
        account: 'Sales',
        debit: 0,
        credit: 100,
        referenceType: ModelNameEnum.SalesInvoice,
        referenceName: 'DOC-1',
      }),
      ale({
        account: 'Creditors',
        debit: 0,
        credit: 40,
        referenceType: ModelNameEnum.PurchaseInvoice,
        referenceName: 'DOC-1',
      }),
      ale({
        account: 'COGS',
        debit: 40,
        credit: 0,
        referenceType: ModelNameEnum.PurchaseInvoice,
        referenceName: 'DOC-1',
      }),
    ],
    invoices: [
      {
        name: 'DOC-1',
        schemaName: ModelNameEnum.SalesInvoice,
        baseGrandTotal: 100,
        exchangeRate: 1,
      },
      {
        name: 'DOC-1',
        schemaName: ModelNameEnum.PurchaseInvoice,
        baseGrandTotal: 40,
        exchangeRate: 1,
      },
    ],
    partyAccounts: PARTY,
  });

  t.equal(net(out, 'Sales'), -100);
  t.equal(net(out, 'COGS'), 0);
  t.end();
});

test('synthetic accounts inject under Income and Expense roots', (t) => {
  const accountMap: Record<string, Account> = {
    Income: {
      name: 'Income',
      rootType: 'Income',
      isGroup: true,
      parentAccount: null,
    },
    Expense: {
      name: 'Expense',
      rootType: 'Expense',
      isGroup: true,
      parentAccount: null,
    },
  };
  injectSyntheticCashBasisAccounts(accountMap);
  t.ok(isSyntheticCashBasisAccount(UNAPPLIED_CASH_INCOME));
  t.equal(accountMap[UNAPPLIED_CASH_INCOME].parentAccount, 'Income');
  t.equal(accountMap[UNAPPLIED_CASH_EXPENSE].parentAccount, 'Expense');
  t.end();
});

test('CSV header includes a basis line', (t) => {
  t.deepEqual(csvBasisHeader('Cash'), [['Cash basis'], []]);
  t.deepEqual(csvBasisHeader('Accrual'), [['Accrual basis'], []]);
  t.deepEqual(csvBasisHeader(undefined), []);
  t.end();
});

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
