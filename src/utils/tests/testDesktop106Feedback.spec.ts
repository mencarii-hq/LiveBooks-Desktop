import test from 'tape';
import { ModelNameEnum } from 'models/types';
import {
  computeLedgerSignedBalance,
  signedBalanceDelta,
} from '../ledgerBalance';
import type { LedgerAleRow } from '../ledgerBalance';
import {
  autocompleteInputKeyword,
  autocompleteOnInput,
  filterAutocompleteSuggestions,
  soleAutocompleteMatch,
} from '../autocompleteInput';
import {
  accumulateRunningBalances,
  compareRegisterAles,
  partyRoleFitsPaymentType,
} from '../registerRows';
import {
  memorizeFieldsError,
  writeEntryRouteFromMemorized,
} from '../memorizedTransactions';
import { formatNumber } from 'fyo/utils/format';
import { Fyo } from 'fyo';
import {
  isInternalPaymentDocName,
  reconcileIdentification,
  typedConfirmMatches,
  userFacingInstrumentRef,
} from '../bankingIdentity';

function ale(
  partial: Partial<LedgerAleRow> & { debit?: number; credit?: number }
): LedgerAleRow {
  return {
    debit: partial.debit ?? 0,
    credit: partial.credit ?? 0,
    date: partial.date,
    reverted: partial.reverted,
    referenceType: partial.referenceType,
    referenceName: partial.referenceName,
    account: partial.account,
  };
}

test('signedBalanceDelta flips for credit (CC) roots', (t) => {
  t.equal(signedBalanceDelta('Asset', 100, 40), 60);
  t.equal(signedBalanceDelta('Liability', 100, 40), -60);
  t.end();
});

test('computeLedgerSignedBalance matches register: exclude reverted, cancelled, future', (t) => {
  const asOf = '2026-08-16T23:59:59.000';
  const ales: LedgerAleRow[] = [
    ale({ debit: 1000, credit: 0, date: '2026-08-01' }),
    ale({ debit: 0, credit: 200, date: '2026-08-02', reverted: true }),
    ale({
      debit: 0,
      credit: 50,
      date: '2026-08-03',
      referenceType: ModelNameEnum.Payment,
      referenceName: 'PAY-CANCELLED',
    }),
    ale({ debit: 25, credit: 0, date: '2026-08-20' }),
    ale({ debit: 0, credit: 10, date: '2026-08-10' }),
  ];
  const cancelled = new Set(['PAY-CANCELLED']);
  const hub = computeLedgerSignedBalance(ales, 'Asset', cancelled, { asOf });
  const register = computeLedgerSignedBalance(ales, 'Asset', cancelled, {
    asOf,
    excludeReverted: true,
    excludeCancelledPayments: true,
  });
  t.equal(hub, 990);
  t.equal(hub, register);
  t.end();
});

test('computeLedgerSignedBalance CC sign-flip matches register', (t) => {
  const asOf = '2026-08-16T23:59:59.000';
  const ales: LedgerAleRow[] = [
    ale({ debit: 0, credit: 500, date: '2026-08-01' }),
    ale({ debit: 80, credit: 0, date: '2026-08-02' }),
    ale({ debit: 0, credit: 20, date: '2026-08-20' }),
  ];
  const v = computeLedgerSignedBalance(ales, 'Liability', new Set(), { asOf });
  t.equal(v, 420);
  t.end();
});

test('autocomplete onInput empty refreshes full list and opens dropdown', (t) => {
  const options = [
    { label: 'Checking' },
    { label: 'Savings' },
    { label: 'Payroll' },
  ];
  const empty = autocompleteOnInput('');
  t.equal(empty.keyword, '');
  t.equal(empty.openDropdown, true);
  t.deepEqual(filterAutocompleteSuggestions(options, empty.keyword), options);

  const afterBackspace = autocompleteOnInput('');
  const typed = autocompleteInputKeyword('sa');
  t.equal(afterBackspace.openDropdown, true);
  t.deepEqual(
    filterAutocompleteSuggestions(options, typed).map((o) => o.label),
    ['Savings']
  );
  t.end();
});

test('register ales sort oldest-first with created tie-break', (t) => {
  const ales = [
    { name: 'b', date: '2026-08-02', created: '2026-08-02T10:00:00' },
    { name: 'a', date: '2026-08-01', created: '2026-08-01T12:00:00' },
    { name: 'c', date: '2026-08-02', created: '2026-08-02T09:00:00' },
  ];
  const sorted = [...ales].sort(compareRegisterAles);
  t.deepEqual(
    sorted.map((r) => r.name),
    ['a', 'c', 'b']
  );
  t.end();
});

test('running balance accumulates monotonically oldest-first', (t) => {
  const bals = accumulateRunningBalances(
    [
      { debit: 100, credit: 0 },
      { debit: 0, credit: 30 },
      { debit: 10, credit: 0 },
    ],
    'Asset'
  );
  t.deepEqual(bals, [100, 70, 80]);
  t.ok(bals[0] > 0);
  t.end();
});

test('partyRoleFitsPaymentType keeps Both, clears role mismatch', (t) => {
  t.ok(partyRoleFitsPaymentType('Both', 'Pay'));
  t.ok(partyRoleFitsPaymentType('Both', 'Receive'));
  t.ok(partyRoleFitsPaymentType('Supplier', 'Pay'));
  t.notOk(partyRoleFitsPaymentType('Customer', 'Pay'));
  t.notOk(partyRoleFitsPaymentType('Supplier', 'Receive'));
  t.end();
});

test('memorizeFieldsError and writeEntryRouteFromMemorized', (t) => {
  t.ok(memorizeFieldsError({ party: '', amount: 10 }));
  t.ok(memorizeFieldsError({ party: 'Acme', amount: 0 }));
  t.equal(memorizeFieldsError({ party: 'Acme', amount: 5 }), '');
  const route = writeEntryRouteFromMemorized({
    name: 'MT-1',
    paymentType: 'Pay',
    fromAccount: 'Bank',
    toAccount: 'Expense',
  });
  t.equal(route.path, '/bank-register/write');
  t.equal(route.query.fromMemorized, 'MT-1');
  t.equal(route.query.account, 'Bank');
  t.equal(route.query.type, '');
  t.end();
});

test('Enter selects sole autocomplete match; Tab does not auto-pick', (t) => {
  const options = [
    { label: 'Office Supplies' },
    { label: 'Office Equipment' },
    { label: 'Rent' },
  ];
  const one = filterAutocompleteSuggestions(options, 'rent');
  t.equal(one.length, 1);
  t.equal(soleAutocompleteMatch(one)?.label, 'Rent');
  const many = filterAutocompleteSuggestions(options, 'office');
  t.equal(many.length, 2);
  t.equal(soleAutocompleteMatch(many), null);
  t.equal(soleAutocompleteMatch(options), null);
  t.end();
});

test('typed CANCEL confirm is case-insensitive', (t) => {
  t.ok(typedConfirmMatches('cancel', 'CANCEL'));
  t.ok(typedConfirmMatches('Cancel', 'CANCEL'));
  t.ok(typedConfirmMatches('  CANCEL  ', 'CANCEL'));
  t.notOk(typedConfirmMatches('canc', 'CANCEL'));
  t.notOk(typedConfirmMatches('', 'CANCEL'));
  t.end();
});

test('formatNumber uses displayPrecision min and max fraction digits', (t) => {
  const fyo = {
    currencyFormatter: undefined,
    singles: { SystemSettings: { locale: 'en-US', displayPrecision: 2 } },
  } as unknown as Fyo;
  t.equal(formatNumber('20', fyo), '20.00');
  t.equal(formatNumber('20.1', fyo), '20.10');
  t.equal(formatNumber('20.01', fyo), '20.01');
  fyo.currencyFormatter = undefined;
  (
    fyo.singles.SystemSettings as { displayPrecision: number }
  ).displayPrecision = 0;
  t.equal(formatNumber('20', fyo), '20');
  t.end();
});

test('reconcile match keys hide Pay-___ and prefer check/EFT/party', (t) => {
  t.ok(isInternalPaymentDocName('PAY-00042'));
  t.ok(isInternalPaymentDocName('Pay-00001'));
  t.notOk(isInternalPaymentDocName('EFT'));
  t.notOk(isInternalPaymentDocName('1001'));
  t.equal(
    userFacingInstrumentRef({
      referenceId: 'PAY-00042',
      paymentMethod: 'Transfer',
      paymentType: 'Pay',
    }),
    'Transfer'
  );
  t.equal(
    userFacingInstrumentRef({
      referenceId: 'EFT',
      paymentMethod: 'Transfer',
      paymentType: 'Pay',
    }),
    'EFT'
  );
  const ids = reconcileIdentification({
    payment: {
      referenceId: 'PAY-00099',
      paymentMethod: 'Transfer',
      paymentType: 'Pay',
      party: 'uuid',
    },
    partyLabel: 'Acme Supplies',
  });
  t.equal(ids.payee, 'Acme Supplies');
  t.equal(ids.referenceShort, 'Transfer');
  t.equal(ids.typeLabel, 'Transfer');
  t.notOk(/pay[-_]/i.test(ids.referenceShort));
  t.notOk(/pay[-_]/i.test(ids.payee));
  t.end();
});
