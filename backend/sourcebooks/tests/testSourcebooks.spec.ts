import AdmZip from 'adm-zip';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import test from 'tape';
import { asArray, extractRecord } from '../extract';
import { classifyZipEntry } from '../indexer';
import { iterateJsonArrayItems } from '../jsonArrayStream';
import {
  companyBaseFromDbPath,
  sidecarDirForDbPath,
  SOURCEBOOKS_DIR_SUFFIX,
} from '../sidecar';
import { SourceBookStore, toFtsQuery } from '../store';
import { summarizeManifest } from 'utils/sourcebooks/manifest';
import { flattenReportRet } from 'utils/sourcebooks/reportRet';

/**
 * Fixture mirrors the final Cloud archive ZIP: root manifest.json,
 * entities/<entity_type>.json arrays of snake_case Ret hashes,
 * report_snapshots/ with raw qbXML ReportRet JSON, and a metadata-only
 * reconciliation/ file (skipped by the indexer). Includes the
 * single-vs-array quirk (one line item = object) and a full invoice ->
 * customer -> payment -> deposit link chain resolved by ListID/TxnID.
 * `LEGACY_FOLDER` covers the older web-download layout that must keep
 * working for local ZIPs.
 */
const LEGACY_FOLDER = 'Test_Co_extracted_QBD_files';

const customers = [
  {
    xml_attributes: {},
    list_id: 'CUST-1',
    name: 'Acme Corp',
    full_name: 'Acme Corp',
    company_name: 'Acme Corporation',
    phone: '555-0100',
    email: 'billing@acme.test',
  },
  {
    xml_attributes: {},
    list_id: 'CUST-1-JOB',
    name: 'Kitchen Remodel',
    full_name: 'Acme Corp:Kitchen Remodel',
    parent_ref: {
      xml_attributes: {},
      list_id: 'CUST-1',
      full_name: 'Acme Corp',
    },
    sublevel: '1',
  },
  {
    xml_attributes: {},
    list_id: 'CUST-2',
    name: 'Beta LLC',
    full_name: 'Beta LLC',
  },
];

const invoices = [
  {
    xml_attributes: {},
    txn_id: 'TXN-INV-1',
    ref_number: 'INV-1001',
    txn_date: '2020-03-15',
    subtotal: '250.00',
    memo: 'March services',
    customer_ref: {
      xml_attributes: {},
      list_id: 'CUST-1',
      full_name: 'Acme Corp',
    },
    // single line item: object, not array (qbxml quirk)
    invoice_line_ret: {
      xml_attributes: {},
      txn_line_id: 'L1',
      item_ref: {
        xml_attributes: {},
        list_id: 'ITEM-1',
        full_name: 'Consulting',
      },
      quantity: '5',
      rate: '50.00',
      amount: '250.00',
    },
    linked_txn: {
      xml_attributes: {},
      txn_id: 'TXN-PAY-1',
      txn_type: 'ReceivePayment',
    },
  },
];

const receivePayments = [
  {
    xml_attributes: {},
    txn_id: 'TXN-PAY-1',
    txn_date: '2020-03-20',
    total_amount: '250.00',
    customer_ref: {
      xml_attributes: {},
      list_id: 'CUST-1',
      full_name: 'Acme Corp',
    },
    applied_to_txn_ret: [
      { xml_attributes: {}, txn_id: 'TXN-INV-1', txn_type: 'Invoice' },
    ],
  },
];

const deposits = [
  {
    xml_attributes: {},
    txn_id: 'TXN-DEP-1',
    txn_date: '2020-03-21',
    deposit_total: '250.00',
    deposit_line_ret: {
      xml_attributes: {},
      payment_txn_id: 'TXN-PAY-1',
      payment_txn_type: 'ReceivePayment',
      amount: '250.00',
    },
  },
];

const items = [
  {
    xml_attributes: {},
    list_id: 'ITEM-1',
    name: 'Consulting',
    full_name: 'Consulting',
    sales_or_purchase: { xml_attributes: {}, price: '50.00' },
  },
];

const manifest = {
  company_name: 'Test Co',
  exported_at: '2020-04-01T12:00:00Z',
  total_records: 7,
  entities: {
    customer: { count: 3, partial: false },
    invoice: { count: 1, partial: true },
    employee: { count: 0, failed: true },
  },
  errors: { employee: 'not available in this edition' },
  reconciliation: { transactions: { expected: 3, extracted: 3 } },
  not_extractable: ['Payroll detail is not exposed by the QBD SDK'],
};

/** Raw qbXML ReportRet as Cloud snapshots it (snake_case, xml_attributes). */
const trialBalance = {
  xml_attributes: {},
  report_title: 'Trial Balance',
  report_subtitle: 'As of March 31, 2020',
  report_basis: 'Accrual',
  col_desc: [
    {
      xml_attributes: { colID: '1', dataType: 'STRTYPE' },
      col_title: { xml_attributes: { titleRow: '1' } },
    },
    {
      xml_attributes: { colID: '2', dataType: 'AMTTYPE' },
      col_title: { xml_attributes: { titleRow: '1', value: 'Debit' } },
    },
    {
      xml_attributes: { colID: '3', dataType: 'AMTTYPE' },
      col_title: [{ xml_attributes: { titleRow: '1', value: 'Credit' } }],
    },
  ],
  report_data: {
    xml_attributes: {},
    data_row: [
      {
        xml_attributes: {},
        row_data: {
          xml_attributes: { rowType: 'account', value: 'Checking' },
        },
        col_data: [
          { xml_attributes: { colID: '1', value: 'Checking' } },
          { xml_attributes: { colID: '2', value: '250.00' } },
        ],
      },
      {
        xml_attributes: {},
        row_data: { xml_attributes: { rowType: 'account', value: 'Sales' } },
        // single col_data: object, not array (qbxml quirk inside ReportRet)
        col_data: { xml_attributes: { colID: '3', value: '250.00' } },
      },
    ],
    total_row: {
      xml_attributes: {},
      col_data: [
        { xml_attributes: { colID: '1', value: 'TOTAL' } },
        { xml_attributes: { colID: '2', value: '250.00' } },
        { xml_attributes: { colID: '3', value: '250.00' } },
      ],
    },
  },
};

const reconciliation = {
  transaction_query: { expected: 3, extracted: 3 },
};

function makeFixtureZip(zipPath: string): void {
  const zip = new AdmZip();
  const add = (name: string, value: unknown) =>
    zip.addFile(name, Buffer.from(JSON.stringify(value), 'utf8'));

  add('manifest.json', manifest);
  add('entities/customer.json', customers);
  add('entities/invoice.json', invoices);
  add('entities/receive_payment.json', receivePayments);
  add('entities/deposit.json', deposits);
  add('entities/item_service.json', items);
  add('report_snapshots/trial_balance.json', trialBalance);
  add('reconciliation/transactions.json', reconciliation);
  zip.writeZip(zipPath);
}

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of gen) {
    out.push(item);
  }
  return out;
}

function chunkedStream(text: string, chunkSize: number): Readable {
  const buf = Buffer.from(text, 'utf8');
  const chunks: Buffer[] = [];
  for (let i = 0; i < buf.length; i += chunkSize) {
    chunks.push(buf.subarray(i, i + chunkSize));
  }
  return Readable.from(chunks);
}

test('sourcebooks: sidecar path resolution', (t) => {
  t.equal(companyBaseFromDbPath('/x/Acme.books.db'), 'Acme');
  t.equal(companyBaseFromDbPath('/x/Acme.db'), 'Acme');
  t.equal(companyBaseFromDbPath('/x/Acme.books'), 'Acme');
  t.equal(
    sidecarDirForDbPath('/x/Acme.books.db'),
    path.resolve(`/x/Acme${SOURCEBOOKS_DIR_SUFFIX}`)
  );
  t.end();
});

test('sourcebooks: zip entry classification', (t) => {
  // Final Cloud layout: entities/ + report_snapshots/ + reconciliation/
  t.deepEqual(classifyZipEntry('entities/invoice.json'), {
    entryName: 'entities/invoice.json',
    kind: 'entity',
    name: 'invoice',
  });
  t.equal(classifyZipEntry('manifest.json')?.kind, 'manifest');
  t.equal(
    classifyZipEntry('report_snapshots/trial_balance.json')?.kind,
    'snapshot'
  );
  t.equal(
    classifyZipEntry('reconciliation/transactions.json'),
    null,
    'reconciliation metadata is not indexed'
  );
  t.equal(
    classifyZipEntry('Some_Root/entities/deposit.json')?.name,
    'deposit',
    'entities/ under a wrapper folder'
  );

  // Legacy layouts: root-level or one wrapper folder
  t.deepEqual(classifyZipEntry(`${LEGACY_FOLDER}/invoice.json`), {
    entryName: `${LEGACY_FOLDER}/invoice.json`,
    kind: 'entity',
    name: 'invoice',
  });
  t.equal(classifyZipEntry(`${LEGACY_FOLDER}/invoices.json`)?.name, 'invoice');
  t.equal(classifyZipEntry('customers.json')?.name, 'customer');
  t.equal(classifyZipEntry(`${LEGACY_FOLDER}/manifest.json`)?.kind, 'manifest');
  t.equal(
    classifyZipEntry(`${LEGACY_FOLDER}/report_snapshots/trial_balance.json`)
      ?.kind,
    'snapshot'
  );
  t.equal(classifyZipEntry(`${LEGACY_FOLDER}/raw/batch_0001.xml`), null);
  t.equal(classifyZipEntry(`${LEGACY_FOLDER}/`), null);
  t.end();
});

test('sourcebooks: manifest summary', (t) => {
  const summary = summarizeManifest(JSON.stringify(manifest));
  t.ok(summary, 'summary parsed');
  t.equal(summary?.companyName, 'Test Co');
  t.equal(summary?.exportedAt, '2020-04-01T12:00:00Z');
  t.equal(summary?.totalRecords, 7);

  const byType = Object.fromEntries(
    (summary?.entities ?? []).map((e) => [e.entityType, e])
  );
  t.equal(byType.customer?.partial, false);
  t.equal(byType.customer?.count, 3);
  t.equal(byType.invoice?.partial, true, 'partial flag');
  t.equal(byType.employee?.failed, true, 'failed flag');
  t.deepEqual(summary?.errors, [
    { entityType: 'employee', message: 'not available in this edition' },
  ]);
  t.deepEqual(summary?.notExtractable, [
    'Payroll detail is not exposed by the QBD SDK',
  ]);

  t.equal(summarizeManifest('not json'), null, 'malformed manifest -> null');
  t.equal(summarizeManifest(undefined), null);

  // pre-manifest Cloud shape folds failed_entities into errors
  const legacy = summarizeManifest(
    JSON.stringify({ failed_entities: { lead: 'timed out' } })
  );
  t.deepEqual(legacy?.errors, [{ entityType: 'lead', message: 'timed out' }]);
  t.end();
});

test('sourcebooks: ReportRet flattening', (t) => {
  const flat = flattenReportRet(trialBalance);
  t.ok(flat, 'flattened');
  t.equal(flat?.title, 'Trial Balance');
  t.equal(flat?.subtitle, 'As of March 31, 2020');
  t.equal(flat?.basis, 'Accrual');
  t.deepEqual(flat?.columns, ['', 'Debit', 'Credit']);
  t.deepEqual(flat?.rows, [
    ['Checking', '250.00', ''],
    ['Sales', '', '250.00'],
    ['TOTAL', '250.00', '250.00'],
  ]);

  // report_ret wrapper (single-vs-array applies to the wrapper too)
  const wrapped = flattenReportRet({ report_ret: trialBalance });
  t.deepEqual(wrapped?.rows.length, 3, 'report_ret wrapper unwrapped');

  t.equal(flattenReportRet({ some: 'object' }), null, 'non-report -> null');
  t.equal(flattenReportRet([1, 2]), null);
  t.end();
});

test('sourcebooks: json array streaming across chunk boundaries', async (t) => {
  const data = [
    { a: 'has "quotes" and , commas', b: [1, 2, { c: ']' }] },
    { d: 'two' },
    { e: null },
  ];
  const text = JSON.stringify(data);
  // Every chunk size from 1 byte up must yield identical parses.
  for (const size of [1, 2, 3, 7, 1024]) {
    const items = await collect(
      iterateJsonArrayItems(chunkedStream(text, size))
    );
    t.deepEqual(items, data, `chunk size ${size}`);
  }

  const empty = await collect(iterateJsonArrayItems(chunkedStream('[]', 1)));
  t.deepEqual(empty, [], 'empty array');

  // multibyte UTF-8 split across chunks
  const utf8 = [{ name: 'Café Ω' }];
  const utf8Items = await collect(
    iterateJsonArrayItems(chunkedStream(JSON.stringify(utf8), 1))
  );
  t.deepEqual(utf8Items, utf8, 'multibyte utf8');
  t.end();
});

test('sourcebooks: extractRecord normalizes single-vs-array', (t) => {
  t.deepEqual(asArray(undefined), []);
  t.deepEqual(asArray({ a: 1 }), [{ a: 1 }]);
  t.deepEqual(asArray([1, 2]), [1, 2]);

  const invoice = extractRecord(invoices[0]);
  t.ok(invoice, 'invoice extracted');
  t.equal(invoice?.qbId, 'TXN-INV-1');
  t.equal(invoice?.idKind, 'txn');
  t.equal(invoice?.refNumber, 'INV-1001');
  t.equal(invoice?.amount, 250);
  t.equal(
    extractRecord({ ...invoices[0], sales_tax_total: '20.00' })?.amount,
    270,
    'invoice amount is subtotal + sales tax'
  );
  t.equal(invoice?.entityName, 'Acme Corp');
  const linkKinds = invoice?.links.map((l) => `${l.kind}:${l.qbId}`).sort();
  t.deepEqual(
    linkKinds,
    ['linked_txn:TXN-PAY-1', 'ref:CUST-1'],
    'invoice links: customer ref + linked payment'
  );

  const job = extractRecord(customers[1]);
  t.equal(job?.parentId, 'CUST-1', 'job parent ListID');
  t.equal(
    job?.links.find((l) => l.kind === 'parent')?.qbId,
    'CUST-1',
    'parent link'
  );

  const deposit = extractRecord(deposits[0]);
  t.equal(
    deposit?.links.find((l) => l.kind === 'linked_txn')?.qbId,
    'TXN-PAY-1',
    'deposit line payment_txn_id link'
  );
  t.end();
});

test('sourcebooks: fts query building', (t) => {
  t.equal(toFtsQuery('acme corp'), '"acme"* "corp"*');
  t.equal(toFtsQuery('  '), '');
  t.equal(toFtsQuery('a"b OR *'), '"ab"* "OR"* "*"*');
  t.end();
});

test('sourcebooks: index build, search, links, snapshots, copy registry', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sourcebooks-test-'));
  const booksDbPath = path.join(tmpDir, 'Test Co.books.db');
  await fs.writeFile(booksDbPath, '');
  const zipPath = path.join(tmpDir, 'export.zip');
  makeFixtureZip(zipPath);

  const store = new SourceBookStore();
  try {
    const before = store.getStatus(booksDbPath);
    t.equal(before.attached, false, 'not attached before');

    const progressStages: string[] = [];
    const status = await store.attachZip({
      booksDbPath,
      zipSource: zipPath,
      meta: { origin: 'local' },
      onProgress: (p) => progressStages.push(p.stage),
    });

    t.equal(status.attached, true, 'attached');
    t.ok(progressStages.includes('indexing'), 'reported indexing progress');
    t.equal(status.meta?.origin, 'local');
    t.ok(status.meta?.archiveId, 'archive id minted');
    t.equal(status.meta?.companyName, 'Test Co', 'company from manifest');
    t.equal(
      status.meta?.exportedAt,
      '2020-04-01T12:00:00Z',
      'export time from manifest'
    );

    const counts = Object.fromEntries(
      (status.entityCounts ?? []).map((c) => [c.entityType, c.count])
    );
    t.equal(counts.customer, 3, '3 customers (incl. job)');
    t.equal(counts.invoice, 1, '1 invoice');
    t.equal(counts.deposit, 1, '1 deposit');

    // FTS search
    const acme = store.search(booksDbPath, { query: 'acme' });
    t.ok(acme.total >= 3, 'acme matches customers + txns via entity_name');
    const acmeTypes = acme.groupCounts.map((g) => g.entityType);
    t.ok(acmeTypes.includes('customer'), 'grouped counts include customer');
    t.ok(acmeTypes.includes('invoice'), 'grouped counts include invoice');

    const filtered = store.search(booksDbPath, {
      query: 'acme',
      entityType: 'invoice',
    });
    t.equal(filtered.rows.length, 1, 'entity filter');
    t.equal(filtered.rows[0].refNumber, 'INV-1001');

    const dated = store.search(booksDbPath, {
      query: 'acme',
      entityType: 'invoice',
      dateFrom: '2021-01-01',
    });
    t.equal(dated.rows.length, 0, 'date filter excludes 2020 invoice');

    // prefix search
    const prefix = store.search(booksDbPath, { query: 'INV-10' });
    t.equal(prefix.rows.length, 1, 'ref number prefix match');

    // Lists: jobs are children of parent customer
    const parents = store.listRecords(booksDbPath, {
      entityType: 'customer',
      parentId: '',
    });
    t.equal(parents.rows.length, 2, 'two parent customers');
    const children = store.listRecords(booksDbPath, {
      entityType: 'customer',
      parentId: 'CUST-1',
    });
    t.equal(children.rows.length, 1, 'one job under Acme');
    t.equal(children.rows[0].name, 'Acme Corp:Kitchen Remodel');

    // Link follow: invoice -> customer + payment; payment -> invoice(incoming)
    const invoice = store.getRecord(booksDbPath, { qbId: 'TXN-INV-1' });
    t.ok(invoice, 'invoice record');
    const custLink = invoice?.outgoing.find((l) => l.kind === 'ref');
    t.equal(custLink?.qbId, 'CUST-1');
    t.equal(custLink?.record?.name, 'Acme Corp', 'ref resolved by ListID');
    const payLink = invoice?.outgoing.find((l) => l.kind === 'linked_txn');
    t.equal(payLink?.record?.entityType, 'receive_payment');

    const payment = store.getRecord(booksDbPath, { qbId: 'TXN-PAY-1' });
    const appliedTo = payment?.outgoing.find(
      (l) => l.kind === 'applied_to_txn'
    );
    t.equal(appliedTo?.record?.refNumber, 'INV-1001', 'payment -> invoice');
    const fromDeposit = payment?.incoming.find(
      (l) => l.record?.entityType === 'deposit'
    );
    t.equal(fromDeposit?.qbId, 'TXN-DEP-1', 'deposit -> payment (incoming)');

    // Full Ret JSON preserved (single line item still an object)
    t.equal(
      (invoice?.data.invoice_line_ret as { txn_line_id: string }).txn_line_id,
      'L1',
      'full Ret JSON round-trips'
    );

    // Snapshots: raw ReportRet stored verbatim, flattenable for display
    t.deepEqual(store.listSnapshots(booksDbPath), ['trial_balance']);
    const snap = store.getSnapshot(booksDbPath, 'trial_balance');
    const flatSnap = flattenReportRet(JSON.parse(snap?.data ?? '{}'));
    t.equal(flatSnap?.title, 'Trial Balance');
    t.equal(flatSnap?.rows.length, 3, 'snapshot flattens to table rows');

    // Copy registry (idempotency support)
    const archiveId = status.meta?.archiveId ?? '';
    store.markCopied(booksDbPath, {
      qbId: 'CUST-1',
      archiveId,
      targetSchema: 'Party',
      targetName: 'Acme Corp',
      copiedAt: new Date().toISOString(),
    });
    t.equal(store.getCopied(booksDbPath, 'CUST-1')?.targetName, 'Acme Corp');
    t.equal(
      store.getRecord(booksDbPath, { qbId: 'CUST-1' })?.copiedTo?.targetSchema,
      'Party'
    );

    // Replace, not union: attaching again resets and re-mints the archive id
    const replaced = await store.attachZip({
      booksDbPath,
      zipSource: zipPath,
      meta: { origin: 'local' },
    });
    t.notEqual(replaced.meta?.archiveId, archiveId, 'replace mints new id');
    t.equal(
      (replaced.entityCounts ?? []).find((c) => c.entityType === 'customer')
        ?.count,
      3,
      'replace does not union'
    );
    t.equal(
      store.getCopied(booksDbPath, 'CUST-1')?.targetName,
      'Acme Corp',
      'copied marker survives replace'
    );
    t.equal(
      store.getRecord(booksDbPath, { qbId: 'CUST-1' })?.copiedTo?.targetSchema,
      'Party',
      'archive viewer still shows already-copied after replace'
    );

    // Orphaned staging junk must not be indexed just because inodes collide.
    const staleStaging = `${store.paths(booksDbPath).zip}.staging`;
    await fs.writeFile(staleStaging, 'stale leftover from a crashed attach');
    const afterStale = await store.attachZip({
      booksDbPath,
      zipSource: zipPath,
      meta: { origin: 'local' },
    });
    t.equal(afterStale.attached, true, 'stale staging is overwritten');
    t.equal(
      (afterStale.entityCounts ?? []).find((c) => c.entityType === 'customer')
        ?.count,
      3,
      'stale staging does not replace the real ZIP'
    );
    t.equal(
      store.getCopied(booksDbPath, 'CUST-1')?.targetName,
      'Acme Corp',
      'copied marker survives stale-staging replace'
    );

    // Failed replace must not promote a new ZIP over the working archive.
    const zipBefore = await fs.readFile(store.paths(booksDbPath).zip);
    const junkZip = path.join(tmpDir, 'junk.zip');
    await fs.writeFile(junkZip, 'not a zip');
    await store
      .attachZip({
        booksDbPath,
        zipSource: junkZip,
        meta: { origin: 'local' },
      })
      .then(
        () => t.fail('junk zip should not attach'),
        () => t.pass('junk zip rejected')
      );
    const afterFailed = store.getStatus(booksDbPath);
    t.equal(afterFailed.attached, true, 'previous archive still attached');
    t.equal(
      afterFailed.meta?.archiveId,
      afterStale.meta?.archiveId,
      'failed replace keeps archive id'
    );
    t.equal(
      (afterFailed.entityCounts ?? []).find((c) => c.entityType === 'customer')
        ?.count,
      3,
      'failed replace keeps previous index'
    );
    t.deepEqual(
      await fs.readFile(store.paths(booksDbPath).zip),
      zipBefore,
      'failed replace leaves archive.zip unchanged'
    );
    t.equal(
      await fs.pathExists(`${store.paths(booksDbPath).zip}.staging`),
      false,
      'staging zip cleaned up'
    );

    // Failed ZIP promote after a successful index must restore the previous pair.
    const archiveIdBeforePromoteFail =
      store.getStatus(booksDbPath).meta?.archiveId;
    const zipBeforePromoteFail = await fs.readFile(
      store.paths(booksDbPath).zip
    );
    const originalMove = fs.move.bind(fs);
    let promoteAttempts = 0;
    fs.move = (async (...args: Parameters<typeof fs.move>) => {
      const [src, dest] = args;
      if (
        dest === store.paths(booksDbPath).zip &&
        String(src).endsWith('.staging')
      ) {
        promoteAttempts += 1;
        throw new Error('injected zip promote failure');
      }
      return originalMove(...args);
    }) as typeof fs.move;
    try {
      await store
        .attachZip({
          booksDbPath,
          zipSource: zipPath,
          meta: { origin: 'local' },
        })
        .then(
          () => t.fail('zip promote failure should not attach'),
          () => t.pass('zip promote failure rejected')
        );
    } finally {
      fs.move = originalMove;
    }
    t.equal(promoteAttempts, 1, 'promote was attempted');
    const afterPromoteFail = store.getStatus(booksDbPath);
    t.equal(
      afterPromoteFail.attached,
      true,
      'previous archive still attached after promote fail'
    );
    t.equal(
      afterPromoteFail.meta?.archiveId,
      archiveIdBeforePromoteFail,
      'promote fail restores previous index'
    );
    t.deepEqual(
      await fs.readFile(store.paths(booksDbPath).zip),
      zipBeforePromoteFail,
      'promote fail leaves archive.zip unchanged'
    );
    t.equal(
      store.getCopied(booksDbPath, 'CUST-1')?.targetName,
      'Acme Corp',
      'copied marker survives promote fail'
    );
    t.equal(
      await fs.pathExists(`${store.paths(booksDbPath).index}.bak`),
      false,
      'index backup cleaned up'
    );

    // Detach removes the sidecar
    await store.detach(booksDbPath);
    t.equal(store.getStatus(booksDbPath).attached, false, 'detached');
    t.equal(
      await fs.pathExists(sidecarDirForDbPath(booksDbPath)),
      false,
      'sidecar dir removed'
    );
  } finally {
    store.closeAll();
    await fs.remove(tmpDir);
  }
  t.end();
});
