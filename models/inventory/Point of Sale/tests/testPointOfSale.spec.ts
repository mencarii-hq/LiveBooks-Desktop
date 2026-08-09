import test from 'tape';
import { closeTestFyo, getTestFyo, setupTestFyo } from 'tests/helpers';
import { SalesInvoice } from 'models/baseModels/SalesInvoice/SalesInvoice';
import { Payment } from 'models/baseModels/Payment/Payment';
import { Money } from 'pesa';
import { ModelNameEnum } from 'models/types';

const fyo = getTestFyo();

setupTestFyo(fyo, __filename);

const customer = { name: 'Someone', role: 'Both' };
const itemMap = {
  Pen: {
    name: 'Pen',
    rate: 700,
  },
  Ink: {
    name: 'Ink',
    rate: 50,
  },
};

let itemId: Record<string, string> = {};
let partyId = '';

test('insert test docs', async (t) => {
  for (const item of Object.values(itemMap)) {
    const doc = await fyo.doc.getNewDoc(ModelNameEnum.Item, item).sync();
    itemId[item.name] = doc.name as string;
  }

  const partyDoc = await fyo.doc
    .getNewDoc(ModelNameEnum.Party, customer)
    .sync();
  partyId = partyDoc.name as string;
});

let sinvDocOne: SalesInvoice | undefined;

test('check pos transacted amount', async (t) => {
  const transactedAmountBeforeTxn = await fyo.db.getPOSTransactedAmount(
    new Date('2023-01-01'),
    new Date('2023-01-02')
  );

  t.equals(transactedAmountBeforeTxn, undefined);

  sinvDocOne = fyo.doc.getNewDoc(ModelNameEnum.SalesInvoice, {
    isPOS: true,
    date: new Date('2023-01-01'),
    account: 'Debtors',
    party: partyId,
  }) as SalesInvoice;

  await sinvDocOne.append('items', {
    item: itemId[itemMap.Pen.name],
    rate: itemMap.Pen.rate,
    quantity: 1,
  });

  await (await sinvDocOne.sync()).submit();
  const paymentDocOne = sinvDocOne.getPayment() as Payment;

  await paymentDocOne.sync();

  const sinvDocTwo = fyo.doc.getNewDoc(ModelNameEnum.SalesInvoice, {
    isPOS: true,
    date: new Date('2023-01-01'),
    account: 'Debtors',
    party: partyId,
  }) as SalesInvoice;

  await sinvDocTwo.append('items', {
    item: itemId[itemMap.Pen.name],
    rate: itemMap.Pen.rate,
    quantity: 1,
  });

  await (await sinvDocTwo.sync()).submit();
  const paymentDocTwo = sinvDocTwo.getPayment() as Payment;

  await paymentDocTwo.setMultiple({
    paymentMethod: 'Transfer',
    clearanceDate: new Date('2023-01-01'),
    referenceId: 'xxxxxxxx',
  });

  await paymentDocTwo.sync();

  const transactedAmountAfterTxn: Record<string, Money> | undefined =
    await fyo.db.getPOSTransactedAmount(
      new Date('2023-01-01'),
      new Date('2023-01-02')
    );

  t.true(transactedAmountAfterTxn);

  t.equals(
    transactedAmountAfterTxn?.Cash,
    sinvDocOne.grandTotal?.float,
    'transacted cash amount matches'
  );

  t.equals(
    transactedAmountAfterTxn?.Transfer,
    sinvDocTwo.grandTotal?.float,
    'transacted transfer amount matches'
  );
});

closeTestFyo(fyo, __filename);
