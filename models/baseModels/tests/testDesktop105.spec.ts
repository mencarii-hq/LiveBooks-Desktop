import test from 'tape';
import { closeTestFyo, getTestFyo, setupTestFyo } from 'tests/helpers';
import { ModelNameEnum } from 'models/types';
import { createNumberSeries } from 'fyo/model/naming';
import { DEFAULT_SERIES_START } from 'fyo/utils/consts';
import {
  getUsedCheckNumbers,
  setPaymentCheckNumber,
} from 'src/utils/checkPrint/numbering';
import { getPartyAddress } from 'src/utils/checkPrint/printChecks';
import { getFormatLayout } from 'src/utils/checkPrint/formats';
import { Payment } from '../Payment/Payment';
import { AccountTypeEnum } from '../Account/types';

const fyo = getTestFyo();
setupTestFyo(fyo, __filename);

const partyName = 'D105 Payee';
let partyId = '';
let partyNoAddressId = '';
const methodName = 'D105 Check';
let bankAccount = '';
let expenseAccount = '';

test('1.0.5 setup: party, bank, check method', async (t) => {
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
      role: 'Supplier',
    })
    .sync();
  partyId = partyDoc.name as string;

  const partyBare = await fyo.doc
    .getNewDoc(ModelNameEnum.Party, {
      name: 'D105 Bare Payee',
      partyName: 'D105 Bare Payee',
      role: 'Supplier',
    })
    .sync();
  partyNoAddressId = partyBare.name as string;

  const address = await fyo.doc
    .getNewDoc(ModelNameEnum.Address, {
      name: 'D105 Address',
      addressLine1: '100 Main St',
      city: 'Mumbai',
      country: 'India',
    })
    .sync();
  await partyDoc.set('address', address.name);
  await partyDoc.sync();

  const expenseGroups = (await fyo.db.getAll(ModelNameEnum.Account, {
    filters: { isGroup: true, rootType: 'Expense' },
    fields: ['name'],
  })) as { name: string }[];
  t.ok(expenseGroups.length, 'expense group exists');

  const expense = await fyo.doc
    .getNewDoc(ModelNameEnum.Account, {
      name: 'D105 Expense',
      accountName: 'D105 Expense',
      rootType: 'Expense',
      parentAccount: expenseGroups[0].name,
      isGroup: false,
    })
    .sync();
  expenseAccount = expense.name as string;

  const assetGroups = (await fyo.db.getAll(ModelNameEnum.Account, {
    filters: { isGroup: true, rootType: 'Asset' },
    fields: ['name'],
  })) as { name: string }[];
  t.ok(assetGroups.length, 'asset group exists');

  const bank = await fyo.doc
    .getNewDoc(ModelNameEnum.Account, {
      name: 'D105 Bank',
      accountName: 'D105 Bank',
      rootType: 'Asset',
      accountType: AccountTypeEnum.Bank,
      parentAccount: assetGroups[0].name,
      isGroup: false,
      nextCheckNumber: 1001,
    })
    .sync();
  bankAccount = bank.name as string;

  await fyo.doc
    .getNewDoc(ModelNameEnum.PaymentMethod, {
      name: methodName,
      type: 'Check',
    })
    .sync();
  t.ok(bankAccount, 'bank account exists');
  t.ok(partyId, 'party exists');
});

async function makeCheckPayment(
  amount: number,
  checkNo: string
): Promise<Payment> {
  const payment = fyo.doc.getNewDoc(ModelNameEnum.Payment, {
    party: partyId,
    date: new Date(),
    paymentType: 'Pay',
    account: bankAccount,
    paymentAccount: expenseAccount,
    paymentMethod: methodName,
    amount: fyo.pesa(amount),
    referenceId: checkNo,
    for: [],
  }) as Payment;
  await payment.sync();
  await payment.submit();
  return payment;
}

test('check # uniqueness per bank account', async (t) => {
  const first = await makeCheckPayment(25, '2001');
  t.equal(String(first.referenceId), '2001');

  const used = await getUsedCheckNumbers(fyo, bankAccount);
  t.ok(used.has('2001'), 'used set includes 2001');

  const second = await makeCheckPayment(10, '2002');
  try {
    await setPaymentCheckNumber(fyo, String(second.name), '2001');
    t.fail('duplicate check number should throw');
  } catch (error) {
    t.match(
      error instanceof Error ? error.message : String(error),
      /already used/,
      'set rejects a used check number'
    );
  }
});

test('setPaymentCheckNumber: uniqueness, audit note, pointer advance', async (t) => {
  const payment = await makeCheckPayment(40, '2010');

  try {
    await setPaymentCheckNumber(fyo, String(payment.name), '2001');
    t.fail('should not reuse 2001');
  } catch (error) {
    t.match(
      error instanceof Error ? error.message : String(error),
      /already used/,
      'set rejects a number used by another payment'
    );
  }

  await setPaymentCheckNumber(fyo, String(payment.name), '2010');
  t.equal(
    String(payment.referenceId),
    '2010',
    'same number on the same payment is allowed'
  );

  await setPaymentCheckNumber(fyo, String(payment.name), '3050');
  await payment.load();
  t.equal(String(payment.referenceId), '3050');
  t.notOk(payment.printLater, 'numbered payment leaves the print queue');
  t.match(String(payment.memo || ''), /2010 → 3050/, 'memo keeps audit note');

  const bank = await fyo.doc.getDoc(ModelNameEnum.Account, bankAccount);
  t.ok(
    Number(bank.nextCheckNumber) > 3050,
    'nextCheckNumber advanced past the manual number'
  );
});

test('getPartyAddress falls back to payee when Address is missing', async (t) => {
  const withAddr = await getPartyAddress(fyo, partyId, partyName);
  t.ok(withAddr.hasStreetAddress, 'linked Address counts as street');
  t.match(withAddr.address, /100 Main St/);
  t.match(withAddr.address, new RegExp(partyName));

  const bare = await getPartyAddress(fyo, partyNoAddressId, 'D105 Bare Payee');
  t.equal(bare.hasStreetAddress, false, 'no Address → no street');
  t.equal(bare.address, 'D105 Bare Payee', 'payee name still prints');
});

test('3-per-page layout includes an address field', (t) => {
  const layout = getFormatLayout('threePerPage');
  t.equal(layout.slots.length, 3);
  for (const slot of layout.slots) {
    t.ok(
      slot.fields.some((f) => f.fieldname === 'address'),
      'three-up slot has address'
    );
  }
  t.end();
});

test('duplicate after submit strips check # and notes provenance', async (t) => {
  const payment = await makeCheckPayment(15, '4001');
  await payment.cancel();

  const dupe = payment.duplicate() as Payment;
  t.equal(String(dupe.referenceId || ''), '', 'check # is not copied');
  t.match(String(dupe.memo || ''), /Duplicated from/, 'provenance note');
  t.notOk(dupe.submitted, 'duplicate is a draft');
});

closeTestFyo(fyo, __filename);
