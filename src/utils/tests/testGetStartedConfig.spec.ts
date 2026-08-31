import test from 'tape';
import {
  connectBankFeedsActionLabel,
  defaultSectionOpen,
} from '../getStartedConfig';

test('Connect Bank Feeds asks for Online sign-in until the desktop session exists', (t) => {
  t.equal(connectBankFeedsActionLabel(false), 'Sign into Online');
  t.equal(connectBankFeedsActionLabel(true), 'Open');
  t.end();
});

test('Get Started sections stay open until complete; Misc stays closed unless saved', (t) => {
  t.equal(defaultSectionOpen({ key: 'accounts' }, false, {}), true);
  t.equal(defaultSectionOpen({ key: 'accounts' }, true, {}), false);
  t.equal(
    defaultSectionOpen({ key: 'misc', optional: true }, false, {}),
    false
  );
  t.equal(
    defaultSectionOpen({ key: 'misc', optional: true }, false, { misc: true }),
    true
  );
  t.equal(
    defaultSectionOpen({ key: 'accounts' }, true, { accounts: true }),
    true
  );
  t.end();
});
