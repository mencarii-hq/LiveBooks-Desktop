import { Fyo } from 'fyo';
import test from 'tape';
import { generateDocId, isUuidDocId } from 'utils/ids';
import { resolveStandardCoaAccountLabel } from 'utils/ids/coaAccountLookup';
import { systemAccountId, buildCoaSeedPath } from 'utils/ids/systemAccountId';

test('generateDocId returns valid uuid v4', (t) => {
  const id = generateDocId();
  t.ok(isUuidDocId(id));
  t.end();
});

test('systemAccountId is stable for the same seed path', (t) => {
  const seed = buildCoaSeedPath(['asset', 'cash_in_hand', 'cash']);
  const a = systemAccountId(seed);
  const b = systemAccountId(seed);
  t.equal(a, b);
  t.ok(isUuidDocId(a));
  t.end();
});

test('systemAccountId differs across seed paths', (t) => {
  const a = systemAccountId(buildCoaSeedPath(['asset', 'cash']));
  const b = systemAccountId(buildCoaSeedPath(['asset', 'bank']));
  t.notEqual(a, b);
  t.end();
});

test('resolveStandardCoaAccountLabel maps receivable/payable labels to uuids', (t) => {
  const fyo = {
    t: (strings: TemplateStringsArray) => strings[0],
  } as unknown as Fyo;
  const debtors = resolveStandardCoaAccountLabel(fyo, 'Debtors');
  const creditors = resolveStandardCoaAccountLabel(fyo, 'Creditors');
  t.ok(isUuidDocId(debtors));
  t.ok(isUuidDocId(creditors));
  t.notEqual(debtors, creditors);
  t.end();
});
