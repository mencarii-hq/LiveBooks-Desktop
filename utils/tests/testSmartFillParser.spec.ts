import test from 'tape';
import {
  getCountryNameFromCode,
  parseSmartFill,
} from '../../src/utils/smartFillParser';

test('parseSmartFill: happy 4-line US block', (t) => {
  const result = parseSmartFill(
    `Louis Simeonidis
2600 S Rock Creek Pkwy 8-203
Superior CO 80027
United States`
  );

  t.ok(result.ok);
  if (!result.ok) {
    t.end();
    return;
  }

  t.equal(result.name, 'Louis Simeonidis');
  t.equal(result.address.addressLine1, '2600 S Rock Creek Pkwy 8-203');
  t.equal(result.address.city, 'Superior');
  t.equal(result.address.state, 'Colorado');
  t.equal(result.address.postalCode, '80027');
  t.equal(result.address.country, 'United States');
  t.end();
});

test('parseSmartFill: CA block with postal code', (t) => {
  const result = parseSmartFill(
    `Jane Doe
123 Main St
Toronto ON M5V 3L9
Canada`
  );

  t.ok(result.ok);
  if (!result.ok) {
    t.end();
    return;
  }

  t.equal(result.address.city, 'Toronto');
  t.equal(result.address.state, 'Ontario');
  t.equal(result.address.postalCode, 'M5V 3L9');
  t.equal(result.address.country, 'Canada');
  t.end();
});

test('parseSmartFill: one-line comma paste', (t) => {
  const result = parseSmartFill(
    'Acme Co, 100 King St, Seattle WA 98101, United States'
  );

  t.ok(result.ok);
  if (!result.ok) {
    t.end();
    return;
  }

  t.equal(result.name, 'Acme Co');
  t.equal(result.address.addressLine1, '100 King St');
  t.equal(result.address.city, 'Seattle');
  t.equal(result.address.state, 'Washington');
  t.end();
});

test('parseSmartFill: street-first refuse', (t) => {
  const result = parseSmartFill(
    `123 Main Street
Denver CO 80202
United States`
  );

  t.notOk(result.ok);
  if (result.ok) {
    t.end();
    return;
  }

  t.equal(result.reason, 'no-name');
  t.end();
});

test('parseSmartFill: no-anchor refuse', (t) => {
  const result = parseSmartFill(`Jane Doe\n123 Main Street\nSomewhere`);

  t.notOk(result.ok);
  if (result.ok) {
    t.end();
    return;
  }

  t.equal(result.reason, 'no-anchor');
  t.end();
});

test('parseSmartFill: ZIP+4', (t) => {
  const result = parseSmartFill(
    `Jane Doe
1 First Ave
Austin TX 78701-1234`
  );

  t.ok(result.ok);
  if (!result.ok) {
    t.end();
    return;
  }

  t.equal(result.address.postalCode, '78701-1234');
  t.equal(result.address.state, 'Texas');
  t.end();
});

test('parseSmartFill: trailing junk appended with warning', (t) => {
  const result = parseSmartFill(
    `Jane Doe
1 First Ave
Austin TX 78701
United States
Suite 900`
  );

  t.ok(result.ok);
  if (!result.ok) {
    t.end();
    return;
  }

  t.equal(result.address.addressLine2, 'Suite 900');
  t.ok(result.warnings.some((w) => w.includes('Address Line 2')));
  t.end();
});

test('parseSmartFill: email and phone peel', (t) => {
  const result = parseSmartFill(
    `Jane Doe
john@example.com
(512) 555-0148
1 First Ave
Austin TX 78701`
  );

  t.ok(result.ok);
  if (!result.ok) {
    t.end();
    return;
  }

  t.equal(result.email, 'john@example.com');
  t.equal(result.phone, '(512) 555-0148');
  t.equal(result.address.addressLine1, '1 First Ave');
  t.end();
});

test('parseSmartFill: state abbrev mapping', (t) => {
  const result = parseSmartFill(
    `Jane Doe
1 First Ave
Denver CO 80202`
  );

  t.ok(result.ok);
  if (!result.ok) {
    t.end();
    return;
  }

  t.equal(result.address.state, 'Colorado');
  t.end();
});

test('getCountryNameFromCode maps short codes to full names', (t) => {
  t.equal(getCountryNameFromCode('us'), 'United States');
  t.equal(getCountryNameFromCode('CA'), 'Canada');
  t.end();
});
