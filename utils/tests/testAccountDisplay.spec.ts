import test from 'tape';
import { accountDisplayName } from '../accountDisplay';

test('accountDisplayName prefers accountName over uuid name', (t) => {
  t.equal(
    accountDisplayName({
      name: '550e8400-e29b-41d4-a716-446655440000',
      accountName: 'Cash',
    }),
    'Cash'
  );
  t.equal(accountDisplayName({ name: 'Legacy Label' }), 'Legacy Label');
  t.end();
});
