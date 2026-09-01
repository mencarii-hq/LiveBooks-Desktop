import test from 'tape';
import { toMemorizedFilterMap } from '../memorizedReportFilters';

test('toMemorizedFilterMap stamps Accrual when basis is missing', (t) => {
  const stamped = toMemorizedFilterMap({ periodicity: 'Monthly' });
  t.equal(stamped.basis, 'Accrual');
  t.equal(toMemorizedFilterMap({ basis: 'Cash' }).basis, 'Cash');
  t.end();
});
