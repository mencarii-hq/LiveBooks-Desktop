import test from 'tape';
import { pruneZeroBalanceRows } from 'reports/AccountReport';
import { ReportCell, ReportRow } from 'reports/types';

function row(
  name: string,
  amounts: number[],
  opts?: { isGroup?: boolean; level?: number; isEmpty?: boolean }
): ReportRow {
  return {
    isGroup: opts?.isGroup,
    level: opts?.level ?? 0,
    isEmpty: opts?.isEmpty,
    cells: [
      { value: name, rawValue: name, align: 'left' } as ReportCell,
      ...amounts.map(
        (rawValue) =>
          ({
            value: String(rawValue),
            rawValue,
            align: 'right',
          } as ReportCell)
      ),
    ],
  };
}

test('pruneZeroBalanceRows drops zero leaves and empty parents', (t) => {
  const rows = [
    row('Income', [0, 10], { isGroup: true, level: 0 }),
    row('Sales', [0, 10], { isGroup: false, level: 1 }),
    row('Other Income', [0, 0], { isGroup: true, level: 0 }),
    row('Interest', [0, 0], { isGroup: false, level: 1 }),
  ];

  const pruned = pruneZeroBalanceRows(rows);
  t.equal(pruned.length, 2);
  t.equal(pruned[0].cells[0].rawValue, 'Income');
  t.equal(pruned[1].cells[0].rawValue, 'Sales');
  t.end();
});

test('pruneZeroBalanceRows keeps empty separators', (t) => {
  const rows = [
    row('Sales', [5], { isGroup: false, level: 1 }),
    row('', [], { isEmpty: true }),
  ];
  const pruned = pruneZeroBalanceRows(rows);
  t.equal(pruned.length, 2);
  t.ok(pruned[1].isEmpty);
  t.end();
});
