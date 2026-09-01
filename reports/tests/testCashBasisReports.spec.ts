import test from 'tape';
import path from 'path';
import setupInstance from 'src/setup/setupInstance';
import { DateTime } from 'luxon';
import { closeTestFyo, getTestDbPath, getTestFyo } from 'tests/helpers';
import { ModelNameEnum } from 'models/types';
import { SalesInvoice } from 'models/baseModels/SalesInvoice/SalesInvoice';
import { Payment } from 'models/baseModels/Payment/Payment';
import { AccountReport } from 'reports/AccountReport';
import { BalanceSheet } from 'reports/BalanceSheet/BalanceSheet';
import { ReportRow } from 'reports/types';
import { getFiscalYear } from 'utils/misc';
import { cashAccountId, debtorsAccountId } from 'utils/ids/coaAccountLookup';
import { CASH_BASIS_NET_INCOME } from 'reports/cashBasis';

const fyo = getTestFyo();
const testName = path.basename(__filename, '.spec.ts');

test(`setup: ${testName}`, async (t) => {
  await setupInstance(
    getTestDbPath(),
    {
      logo: null,
      companyName: 'Cash Basis Test Co',
      country: 'France',
      fullname: 'Test Person',
      email: 'cashbasis@test.com',
      bankName: 'Test Bank',
      currency: 'EUR',
      fiscalYearStart: DateTime.fromJSDate(
        getFiscalYear('01-01', true)!
      ).toISODate(),
      fiscalYearEnd: DateTime.fromJSDate(
        getFiscalYear('01-01', false)!
      ).toISODate(),
      chartOfAccounts: 'Standard Chart of Accounts',
      desktopTheme: 'classic',
    },
    fyo
  );
  t.end();
});

const partyName = 'Cash Basis Party';
const itemName = 'Cash Basis Item';
const rate = 100;
let partyId = '';
let itemId = '';
let debtorsId = '';
let cashId = '';

class CashProbe extends AccountReport {
  static title = 'Cash Probe';
  static reportName = 'cash-probe';
  loading = false;

  async setReportData(filter?: string, force?: boolean) {
    if (this.shouldReloadRawData(filter, force)) {
      await this._setRawData();
    }
  }
}

function rowAmount(rows: ReportRow[], account: string): number {
  const row = rows.find(
    (candidate) => candidate.cells[0]?.rawValue === account
  );
  if (!row) {
    return 0;
  }
  return row.cells.slice(1).reduce((sum, cell) => {
    return sum + (typeof cell.rawValue === 'number' ? cell.rawValue : 0);
  }, 0);
}

async function runProbe(basis: 'Accrual' | 'Cash') {
  const report = new CashProbe(fyo);
  report.basedOn = 'Until Date';
  report.toDate = '2026-12-31';
  report.count = 12;
  report.consolidateColumns = true;
  report.basis = basis;
  await report.initialize();
  return report;
}

async function runBalanceSheet(basis: 'Accrual' | 'Cash') {
  const report = new BalanceSheet(fyo);
  report.basedOn = 'Until Date';
  report.toDate = '2026-12-31';
  report.count = 12;
  report.consolidateColumns = true;
  report.basis = basis;
  await report.initialize();
  return report;
}

function incomeCredit(report: CashProbe): number {
  return report._rawData
    .filter((entry) => entry.account !== debtorsId && entry.account !== cashId)
    .reduce((sum, entry) => sum + (entry.credit ?? 0) - (entry.debit ?? 0), 0);
}

test('cash-basis reports setup', async (t) => {
  await fyo.singles.AccountingSettings!.setAndSync(
    'enablePartialPayment',
    true
  );
  const partyDoc = await fyo.doc
    .getNewDoc(ModelNameEnum.Party, { name: partyName, role: 'Both' })
    .sync();
  partyId = partyDoc.name as string;
  const itemDoc = await fyo.doc
    .getNewDoc(ModelNameEnum.Item, {
      name: itemName,
      rate,
      for: 'Sales',
    })
    .sync();
  itemId = itemDoc.name as string;
  debtorsId = debtorsAccountId(fyo);
  cashId = cashAccountId(fyo);
  t.ok(partyId);
  t.ok(itemId);
  t.ok(await fyo.db.exists(ModelNameEnum.Account, debtorsId));
  t.ok(await fyo.db.exists(ModelNameEnum.Account, cashId));
});

test('Balance Sheet cash drops unpaid AR and stays balanced', async (t) => {
  const sinv = fyo.doc.getNewDoc(ModelNameEnum.SalesInvoice, {
    account: debtorsId,
    party: partyId,
    date: '2026-08-01',
    items: [{ item: itemId, rate, quantity: 1 }],
  }) as SalesInvoice;
  await sinv.runFormulas();
  await sinv.sync();
  await sinv.submit();

  const accrual = await runBalanceSheet('Accrual');
  const cash = await runBalanceSheet('Cash');
  const accrualAr = rowAmount(accrual.reportData, debtorsId);
  const cashAr = rowAmount(cash.reportData, debtorsId);
  t.ok(accrualAr !== 0, 'accrual BS shows Debtors from unpaid invoice');
  t.equal(cashAr, 0, 'cash BS does not show unpaid AR');

  const cashAssets = rowAmount(cash.reportData, 'Total Asset (Debit)');
  const cashLiab = rowAmount(cash.reportData, 'Total Liability (Credit)');
  const cashEquity = rowAmount(cash.reportData, 'Total Equity (Credit)');
  t.equal(
    Math.round((cashAssets - cashLiab - cashEquity) * 100) / 100,
    0,
    'cash BS equation holds on consolidated window'
  );
  t.end();
});

test('P&L: unpaid invoice is accrual-only', async (t) => {
  const sinv = fyo.doc.getNewDoc(ModelNameEnum.SalesInvoice, {
    account: debtorsId,
    party: partyId,
    date: '2026-06-01',
    items: [{ item: itemId, rate, quantity: 1 }],
  }) as SalesInvoice;
  await sinv.runFormulas();
  await sinv.sync();
  await sinv.submit();

  const accrual = await runProbe('Accrual');
  const cash = await runProbe('Cash');
  t.ok(incomeCredit(accrual) >= rate, 'accrual includes invoiced income');
  t.equal(incomeCredit(cash), 0, 'unpaid invoice does not hit cash P&L');
  t.end();
});

test('P&L: payment recognizes cash income and print meta labels basis', async (t) => {
  const sinv = fyo.doc.getNewDoc(ModelNameEnum.SalesInvoice, {
    account: debtorsId,
    party: partyId,
    date: '2026-06-02',
    items: [{ item: itemId, rate, quantity: 1 }],
  }) as SalesInvoice;
  await sinv.runFormulas();
  await sinv.sync();
  await sinv.submit();

  const payment = sinv.getPayment() as Payment;
  await payment.set('paymentAccount', cashId);
  await payment.set('date', '2026-07-15');
  await payment.runFormulas();
  await payment.sync();
  await payment.submit();

  const accrual = await runProbe('Accrual');
  const cash = await runProbe('Cash');
  t.ok(
    (accrual.getPrintMeta().subtitle ?? '').includes('Accrual basis'),
    accrual.getPrintMeta().subtitle
  );
  t.ok(
    (cash.getPrintMeta().subtitle ?? '').includes('Cash basis'),
    cash.getPrintMeta().subtitle
  );
  t.ok(incomeCredit(cash) >= rate, 'cash P&L recognizes paid income');
  t.end();
});

test('cash BS includes net income so the equation holds after collection', async (t) => {
  const report = await runBalanceSheet('Cash');
  const cashAr = rowAmount(report.reportData, debtorsId);
  const cashBal = rowAmount(report.reportData, cashId);
  const ni = rowAmount(report.reportData, CASH_BASIS_NET_INCOME);
  t.equal(cashAr, 0, 'cash BS drops AR');
  t.ok(cashBal >= rate, 'cash BS keeps collected cash');
  t.ok(ni >= rate, 'cash-basis net income plugged into equity');

  const cashAssets = rowAmount(report.reportData, 'Total Asset (Debit)');
  const cashLiab = rowAmount(report.reportData, 'Total Liability (Credit)');
  const cashEquity = rowAmount(report.reportData, 'Total Equity (Credit)');
  t.equal(
    Math.round((cashAssets - cashLiab - cashEquity) * 100) / 100,
    0,
    'cash BS equation holds after collection'
  );
  t.end();
});

test('cash BS columns are cumulative from inception', async (t) => {
  const sinv = fyo.doc.getNewDoc(ModelNameEnum.SalesInvoice, {
    account: debtorsId,
    party: partyId,
    date: '2025-01-15',
    items: [{ item: itemId, rate, quantity: 1 }],
  }) as SalesInvoice;
  await sinv.runFormulas();
  await sinv.sync();
  await sinv.submit();

  const payment = sinv.getPayment() as Payment;
  await payment.set('paymentAccount', cashId);
  await payment.set('date', '2025-01-16');
  await payment.runFormulas();
  await payment.sync();
  await payment.submit();

  const report = new BalanceSheet(fyo);
  report.basedOn = 'Until Date';
  report.toDate = '2026-12-31';
  report.count = 1;
  report.consolidateColumns = true;
  report.basis = 'Cash';
  await report.initialize();

  const cashBal = rowAmount(report.reportData, cashId);
  t.ok(
    cashBal >= rate * 2,
    'cash collected before the visible window still appears'
  );
  const cashAssets = rowAmount(report.reportData, 'Total Asset (Debit)');
  const cashLiab = rowAmount(report.reportData, 'Total Liability (Credit)');
  const cashEquity = rowAmount(report.reportData, 'Total Equity (Credit)');
  t.equal(Math.round((cashAssets - cashLiab - cashEquity) * 100) / 100, 0);
  t.end();
});

closeTestFyo(fyo, __filename);
