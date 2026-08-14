import { Fyo, t } from 'fyo';
import { Action } from 'fyo/model/types';
import { DateTime } from 'luxon';
import { ModelNameEnum } from 'models/types';
import { Money } from 'pesa';
import getCommonExportActions from 'reports/commonExporter';
import { Report } from 'reports/Report';
import { ColumnField, ReportCell, ReportData, ReportRow } from 'reports/types';
import { Field } from 'schemas/types';
import { getPartyNameMap } from 'src/utils/partyNames';
import { QueryFilter } from 'utils/db/types';

type InvoiceRowRaw = {
  name: string;
  party: string;
  date: string;
  grandTotal: string | number;
};

export class SalesByCustomer extends Report {
  static title = t`Sales by Customer`;
  static reportName = 'sales-by-customer';
  loading = false;
  fromDate?: string;
  toDate?: string;

  constructor(fyo: Fyo) {
    super(fyo);
    const listener = () => (this.shouldRefresh = true);
    this.fyo.doc.observer.on(`sync:${ModelNameEnum.SalesInvoice}`, listener);
    this.fyo.doc.observer.on(`delete:${ModelNameEnum.SalesInvoice}`, listener);
  }

  setDefaultFilters(): void {
    if (!this.toDate) {
      this.toDate = DateTime.now().toISODate();
      this.fromDate = DateTime.now().minus({ years: 1 }).toISODate();
    }
  }

  getFilters(): Field[] {
    return [
      {
        fieldtype: 'Date',
        fieldname: 'fromDate',
        placeholder: t`From Date`,
        label: t`From Date`,
        required: true,
      },
      {
        fieldtype: 'Date',
        fieldname: 'toDate',
        placeholder: t`To Date`,
        label: t`To Date`,
        required: true,
      },
    ] as Field[];
  }

  getColumns(): ColumnField[] {
    return [
      {
        label: t`Customer`,
        fieldtype: 'Data',
        fieldname: 'party',
        align: 'left',
        width: 2,
      },
      {
        label: t`Invoices`,
        fieldtype: 'Int',
        fieldname: 'count',
        align: 'right',
        width: 1,
      },
      {
        label: t`Amount`,
        fieldtype: 'Currency',
        fieldname: 'amount',
        align: 'right',
        width: 1.25,
      },
    ];
  }

  getActions(): Action[] {
    return getCommonExportActions(this);
  }

  getPrintMeta(): { subtitle?: string } {
    if (!this.fromDate || !this.toDate) {
      return {};
    }

    return {
      subtitle: `${this.fyo.format(this.fromDate, 'Date')} – ${this.fyo.format(
        this.toDate,
        'Date'
      )}`,
    };
  }

  getDrillDownRoute(row: ReportRow) {
    const party = row.cells[0]?.rawValue;
    if (typeof party !== 'string' || !party || party === '__total__') {
      return null;
    }

    const filters: QueryFilter = {
      party,
      submitted: true,
      cancelled: false,
    };
    if (this.fromDate && this.toDate) {
      filters.date = ['>=', this.fromDate, '<=', this.toDate];
    }

    return {
      name: 'ListView',
      params: { schemaName: ModelNameEnum.SalesInvoice },
      query: {
        filters: JSON.stringify(filters),
      },
    };
  }

  async setReportData(): Promise<void> {
    this.loading = true;
    this.setDefaultFilters();

    const date: string[] = [];
    if (this.toDate) {
      date.push('<=', this.toDate);
    }
    if (this.fromDate) {
      date.push('>=', this.fromDate);
    }

    const filters: QueryFilter = {
      submitted: true,
      cancelled: false,
    };
    if (date.length) {
      filters.date = date;
    }

    const raw = (await this.fyo.db.getAllRaw(ModelNameEnum.SalesInvoice, {
      fields: ['name', 'party', 'date', 'grandTotal'],
      filters,
    })) as InvoiceRowRaw[];

    const grouped = new Map<string, { count: number; amount: Money }>();
    for (const invoice of raw) {
      const party = String(invoice.party ?? '');
      const current = grouped.get(party) ?? {
        count: 0,
        amount: this.fyo.pesa(0),
      };
      current.count += 1;
      current.amount = current.amount.add(this.fyo.pesa(invoice.grandTotal));
      grouped.set(party, current);
    }

    const partyIds = [...grouped.keys()].filter(Boolean);
    const names = await getPartyNameMap(this.fyo, partyIds);

    const rows = [...grouped.entries()]
      .sort((a, b) => b[1].amount.sub(a[1].amount).float)
      .map(([party, data]) =>
        this._partyRow(party, names.get(party) ?? party, data)
      );

    const totalAmount = [...grouped.values()].reduce(
      (sum, row) => sum.add(row.amount),
      this.fyo.pesa(0)
    );
    const totalCount = [...grouped.values()].reduce(
      (sum, row) => sum + row.count,
      0
    );

    this.reportData = [
      ...rows,
      this._totalRow(totalCount, totalAmount),
    ] as ReportData;
    this.loading = false;
  }

  _partyRow(
    party: string,
    label: string,
    data: { count: number; amount: Money }
  ): ReportRow {
    return {
      cells: [
        {
          value: label,
          rawValue: party,
          align: 'left',
          width: 2,
        },
        {
          value: String(data.count),
          rawValue: data.count,
          align: 'right',
          width: 1,
        },
        {
          value: this.fyo.format(data.amount, 'Currency'),
          rawValue: data.amount.float,
          align: 'right',
          width: 1.25,
        },
      ] as ReportCell[],
    };
  }

  _totalRow(count: number, amount: Money): ReportRow {
    return {
      cells: [
        {
          value: t`Total`,
          rawValue: '__total__',
          align: 'left',
          width: 2,
          bold: true,
        },
        {
          value: String(count),
          rawValue: count,
          align: 'right',
          width: 1,
          bold: true,
        },
        {
          value: this.fyo.format(amount, 'Currency'),
          rawValue: amount.float,
          align: 'right',
          width: 1.25,
          bold: true,
        },
      ] as ReportCell[],
    };
  }
}
