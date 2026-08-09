import test from 'tape';
import { closeTestFyo, getTestFyo, setupTestFyo } from 'tests/helpers';
import { ModelNameEnum } from 'models/types';
import { getItem } from 'models/inventory/tests/helpers';
import { SalesInvoice } from '../SalesInvoice/SalesInvoice';

const fyo = getTestFyo();
setupTestFyo(fyo, __filename);

const itemMap = {
  Pen: {
    name: 'Pen',
    rate: 100,
    unit: 'Unit',
  },
};

const partyMap = {
  partyOne: {
    name: 'John Whoe',
    email: 'john@whoe.com',
  },
};

let itemId: Record<string, string> = {};
let partyId = '';

const priceListMap = {
  PL_SELL: {
    name: 'PL_SELL',
    isSales: true,
    priceListItem: [
      {
        item: itemMap.Pen.name,
        rate: 101,
      },
    ],
  },
};

test('Price List: create dummy item, party, price lists', async (t) => {
  // Create Items
  for (const { name, rate } of Object.values(itemMap)) {
    const item = getItem(name, rate, false);
    const doc = await fyo.doc.getNewDoc(ModelNameEnum.Item, item).sync();
    itemId[name] = doc.name as string;
    t.ok(
      await fyo.db.exists(ModelNameEnum.Item, itemId[name]),
      `Item: ${name} exists`
    );
  }

  for (const { name, email } of Object.values(partyMap)) {
    const doc = await fyo.doc
      .getNewDoc(ModelNameEnum.Party, { name, email })
      .sync();
    partyId = doc.name as string;
    t.ok(
      await fyo.db.exists(ModelNameEnum.Party, partyId),
      `Party: ${name} exists`
    );
  }

  for (const priceListItem of Object.values(priceListMap)) {
    const pl = {
      ...priceListItem,
      priceListItem: priceListItem.priceListItem.map((row) => ({
        ...row,
        item: itemId[row.item as string],
      })),
    };
    await fyo.doc.getNewDoc(ModelNameEnum.PriceList, pl).sync();
    t.ok(
      await fyo.db.exists(ModelNameEnum.PriceList, priceListItem.name),
      `Price List: ${priceListItem.name} exists`
    );
  }

  await fyo.singles.AccountingSettings?.set('enablePriceList', true);
});

test('Check if InvoiceItem rate fetched from PriceList', async (t) => {
  const sinv = fyo.doc.getNewDoc(ModelNameEnum.SalesInvoice, {
    date: new Date('2023-01-01'),
    party: partyId,
  }) as SalesInvoice;

  await sinv.set('priceList', priceListMap.PL_SELL.name);
  await sinv.append('items', {});
  await sinv.items?.[0].set('item', itemId[itemMap.Pen.name]);

  t.equal(
    sinv.items?.[0].rate?.float,
    priceListMap.PL_SELL.priceListItem[0].rate,
    `sales invoice rate fetched from price list`
  );
});

closeTestFyo(fyo, __filename);
