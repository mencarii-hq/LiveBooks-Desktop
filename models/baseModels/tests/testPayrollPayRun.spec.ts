import test from 'tape';
import { computePayRunLine } from 'src/utils/payrollPayRun';
import type { PayrollProfileLike } from 'src/utils/payrollPayRun';

function salaryProfile(
  overrides: Partial<PayrollProfileLike> = {}
): PayrollProfileLike {
  return {
    name: '1',
    party: 'emp-1',
    payType: 'Salary',
    rate: 5000,
    expenseAccount: 'Salary',
    deductions: [
      {
        account: 'Federal Tax Payable',
        deductionType: 'Percent',
        amount: 10,
        description: 'FIT',
      },
      {
        account: 'Health Insurance Payable',
        deductionType: 'Fixed',
        amount: 100,
        description: 'Health',
      },
    ],
    ...overrides,
  };
}

test('computePayRunLine: salary gross, percent+fixed deductions, signed splits', (t) => {
  const line = computePayRunLine(salaryProfile());
  t.equal(line.gross, 5000);
  t.equal(line.deductionTotal, 600);
  t.equal(line.net, 4400);
  t.equal(line.splits.length, 3);
  t.equal(line.splits[0].account, 'Salary');
  t.equal(line.splits[0].amount, 5000);
  t.equal(line.splits[1].amount, -500);
  t.equal(line.splits[2].amount, -100);
  const splitSum = line.splits.reduce((s, r) => s + r.amount, 0);
  t.equal(splitSum, line.net);
  t.end();
});

test('computePayRunLine: hourly requires hours and computes gross', (t) => {
  const profile = salaryProfile({ payType: 'Hourly', rate: 25 });
  t.throws(() => computePayRunLine(profile), /Hours are required/);
  t.throws(() => computePayRunLine(profile, 0), /Hours are required/);
  t.throws(() => computePayRunLine(profile, -8), /Hours are required/);

  const line = computePayRunLine(profile, 40);
  t.equal(line.gross, 1000);
  t.equal(line.deductionTotal, 200);
  t.equal(line.net, 800);
  t.end();
});

test('computePayRunLine: net must be greater than 0', (t) => {
  t.throws(
    () =>
      computePayRunLine(
        salaryProfile({
          rate: 100,
          deductions: [
            {
              account: 'Tax',
              deductionType: 'Fixed',
              amount: 100,
            },
          ],
        })
      ),
    /Net pay must be greater than 0/
  );
  t.end();
});

test('computePayRunLine: rounds to the given currency precision', (t) => {
  // 33.335 * 3h = 100.005 gross; 10% = 10.0005 deduction.
  const profile = salaryProfile({
    payType: 'Hourly',
    rate: 33.335,
    deductions: [{ account: 'Tax', deductionType: 'Percent', amount: 10 }],
  });

  const twoDp = computePayRunLine(profile, 3, 2);
  t.equal(twoDp.gross, 100.01, '2dp gross rounds up');
  t.equal(twoDp.deductionTotal, 10, '2dp percent deduction rounds');
  t.equal(twoDp.net, 90.01, '2dp net = gross - deductions');
  const twoDpSum = twoDp.splits.reduce((s, r) => s + r.amount, 0);
  t.equal(twoDpSum, twoDp.net, '2dp signed split sum equals net');

  const zeroDp = computePayRunLine(profile, 3, 0);
  t.equal(zeroDp.gross, 100, '0dp gross is a whole number');
  t.equal(zeroDp.deductionTotal, 10, '0dp deduction is a whole number');
  t.equal(zeroDp.net, 90, '0dp net is a whole number');
  const zeroDpSum = zeroDp.splits.reduce((s, r) => s + r.amount, 0);
  t.equal(zeroDpSum, zeroDp.net, '0dp signed split sum equals net');
  t.end();
});

test('computePayRunLine: skips empty/zero deduction rows, keeps money-like amounts', (t) => {
  const line = computePayRunLine(
    salaryProfile({
      deductions: [
        { account: '', deductionType: 'Fixed', amount: 50 },
        { account: 'Tax', deductionType: 'Fixed', amount: 0 },
        // pesa-Money-like value (has .float).
        { account: 'Tax', deductionType: 'Fixed', amount: { float: 250 } },
      ],
    })
  );
  t.equal(line.deductions.length, 1, 'only the usable row remains');
  t.equal(line.deductionTotal, 250, 'Money-like amount is used');
  t.equal(line.net, 4750);
  t.end();
});
