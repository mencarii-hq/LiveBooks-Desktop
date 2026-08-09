import test from 'tape';
import { closeTestFyo, getTestFyo, setupTestFyo } from 'tests/helpers';
import { ModelNameEnum } from 'models/types';
import { Lead } from '../Lead/Lead';
import { Party } from '../Party/Party';

const fyo = getTestFyo();
setupTestFyo(fyo, __filename);

const leadData = {
  name: 'name2',
  status: 'Open',
  email: 'sample@gmail.com',
  mobile: '1234567890',
};

const itemData: { name: string; rate: number } = {
  name: 'Pen',
  rate: 100,
};

let itemId = '';
let partyIdFromLead = '';

test('create test docs for Lead', async (t) => {
  const itemDoc = await fyo.doc.getNewDoc(ModelNameEnum.Item, itemData).sync();
  itemId = itemDoc.name as string;

  t.ok(
    fyo.db.exists(ModelNameEnum.Item, itemId),
    `dummy item ${itemData.name}  exists`
  );
});

test('create a Lead doc', async (t) => {
  await fyo.doc.getNewDoc(ModelNameEnum.Lead, leadData).sync();

  t.ok(
    fyo.db.exists(ModelNameEnum.Lead, leadData.name),
    `${leadData.name} exists`
  );
});

test('create Customer from Lead', async (t) => {
  const leadDoc = (await fyo.doc.getDoc(ModelNameEnum.Lead, 'name2')) as Lead;

  const newCustomer = leadDoc.createCustomer();

  t.equals(
    leadDoc.status,
    'Open',
    'status must be Open before Customer is created'
  );

  await newCustomer.sync();
  partyIdFromLead = newCustomer.name as string;

  t.equals(
    leadDoc.status,
    'Converted',
    'status should change to Converted after Customer is created'
  );

  t.ok(
    await fyo.db.exists(ModelNameEnum.Party, partyIdFromLead),
    'Customer created from Lead'
  );
});

test('create SalesQuote', async (t) => {
  const leadDoc = (await fyo.doc.getDoc(ModelNameEnum.Lead, 'name2')) as Lead;

  const newSalesQuote = leadDoc.createSalesQuote();

  newSalesQuote.items = [];
  newSalesQuote.append('items', {
    item: itemId,
    quantity: 1,
    rate: itemData.rate,
  });

  t.equals(
    leadDoc.status,
    'Converted',
    'status must be Open before SQUOT is created'
  );

  await newSalesQuote.sync();
  await newSalesQuote.submit();

  t.equals(
    leadDoc.status,
    'Quotation',
    'status should change to Quotation after SQUOT submission'
  );

  t.ok(
    await fyo.db.exists(ModelNameEnum.SalesQuote, newSalesQuote.name),
    'SalesQuote Created from Lead'
  );
});

test('delete Customer then lead status changes to Interested', async (t) => {
  const partyDoc = (await fyo.doc.getDoc(
    ModelNameEnum.Party,
    partyIdFromLead
  )) as Party;

  await partyDoc.delete();

  t.equals(
    await fyo.db.exists(ModelNameEnum.Party, partyIdFromLead),
    false,
    'Customer deleted'
  );

  const leadDoc = (await fyo.doc.getDoc(ModelNameEnum.Lead, 'name2')) as Lead;

  t.equals(
    leadDoc.status,
    'Interested',
    'status should change to Interested after Customer is deleted'
  );
});

closeTestFyo(fyo, __filename);
