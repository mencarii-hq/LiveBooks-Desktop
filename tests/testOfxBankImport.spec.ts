import test from 'tape';
import { parseOfxBankFile } from 'src/utils/ofxBankImport';

const sampleOfx = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKTRANLIST>
<STMTTRN>
<DTPOSTED>20240315120000.000[-5:EST]
<TRNAMT>-25.50
<FITID>abc1
<NAME>Coffee Shop
</STMTTRN>
<STMTTRN>
<DTPOSTED>20240320120000.000[-5:EST]
<TRNAMT>100.00
<FITID>abc2
<NAME>Deposit
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
`;

test('parseOfxBankFile extracts transactions', (t) => {
  const r = parseOfxBankFile(sampleOfx);
  t.equal(r.ok, true);
  if (r.ok) {
    t.equal(r.rows.length, 2);
    t.equal(r.rows[0].date, '2024-03-15');
    t.equal(r.rows[0].amount, -25.5);
    t.equal(r.rows[0].fitid, 'abc1');
    t.equal(r.rows[1].date, '2024-03-20');
    t.equal(r.rows[1].amount, 100);
  }
  t.end();
});

test('parseOfxBankFile rejects garbage', (t) => {
  const r = parseOfxBankFile('not an ofx file at all');
  t.equal(r.ok, false);
  t.end();
});
