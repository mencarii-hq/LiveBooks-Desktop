import test from 'tape';
import { Fyo } from 'fyo';
import { format } from 'fyo/utils/format';

function mockFyo(countryCode?: string, dateFormat = 'MMM d, y'): Fyo {
  return {
    singles: {
      SystemSettings: {
        countryCode,
        dateFormat,
      },
    },
  } as unknown as Fyo;
}

test('US/CA table dates are numeric mm/dd/yy', (t) => {
  const value = '1989-12-26';
  t.equal(format(value, 'Date', null, mockFyo('us')), '12/26/89');
  t.equal(format(value, 'Date', null, mockFyo('ca')), '12/26/89');
  t.equal(format(value, 'Date', null, mockFyo('US')), '12/26/89');
  t.equal(format(value, 'Date', null, mockFyo(undefined)), '12/26/89');
  t.equal(format(value, 'Date', null, mockFyo('')), '12/26/89');
  t.end();
});

test('US/CA dates stay numeric even if settings store a month-name format', (t) => {
  const formatted = format(
    '1989-12-26',
    'Date',
    null,
    mockFyo('us', 'MMMM d, yy')
  );
  t.equal(formatted, '12/26/89');
  t.notOk(/[A-Za-z]/.test(formatted));
  t.end();
});

test('US/CA datetime keeps the time part', (t) => {
  t.equal(
    format('1989-12-26T15:30:45', 'Datetime', null, mockFyo('us')),
    '12/26/89 15:30:45'
  );
  t.end();
});

test('text columns are not parsed as dates', (t) => {
  t.equal(
    format('December 26, 89', 'Data', null, mockFyo('us')),
    'December 26, 89'
  );
  t.end();
});

test('non-US/CA companies keep SystemSettings dateFormat', (t) => {
  t.equal(
    format('1989-12-26', 'Date', null, mockFyo('in', 'MMM d, y')),
    'Dec 26, 1989'
  );
  t.equal(
    format('1989-12-26', 'Date', null, mockFyo('in', 'dd/MM/yyyy')),
    '26/12/1989'
  );
  t.end();
});
