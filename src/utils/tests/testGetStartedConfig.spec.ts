import test from 'tape';
import { connectBankFeedsActionLabel } from '../getStartedConfig';

test('Connect Bank Feeds asks for Cloud sign-in until the desktop session exists', (t) => {
  t.equal(connectBankFeedsActionLabel(false), 'Sign into Cloud');
  t.equal(connectBankFeedsActionLabel(true), 'Open');
  t.end();
});
