import { Fyo } from 'fyo';
import { Converter } from 'fyo/core/converter';
import { DocValue } from 'fyo/core/types';
import { Action } from 'fyo/model/types';
import Observable from 'fyo/utils/observable';
import { Field, RawValue } from 'schemas/types';
import { getIsNullOrUndef } from 'utils';
import { reactive } from 'vue';
import { ColumnField, ReportData, ReportRow } from './types';

export abstract class Report extends Observable<RawValue> {
  static title: string;
  static reportName: string;
  static isInventory = false;

  fyo: Fyo;
  columns: ColumnField[] = [];
  filters: Field[] = [];
  reportData: ReportData;
  usePagination = false;
  shouldRefresh = false;
  abstract loading: boolean;

  constructor(fyo: Fyo) {
    super();
    this.fyo = fyo;
    this.reportData = [];
    // Like Doc: subclass constructors (and the observer listeners they
    // register) capture this proxy, so `shouldRefresh = true` set from an
    // fyo observer is visible to Vue watchers (pane live-refresh).
    return reactive(this) as unknown as this;
  }

  get title(): string {
    return (this.constructor as typeof Report).title;
  }

  get reportName(): string {
    return (this.constructor as typeof Report).reportName;
  }

  async initialize() {
    /**
     * Not in constructor cause possibly async.
     */

    await this.setDefaultFilters();
    this.filters = await this.getFilters();
    this.columns = await this.getColumns();
    await this.setReportData();
  }

  get filterMap() {
    const filterMap: Record<string, RawValue> = {};
    for (const { fieldname } of this.filters) {
      const value = this.get(fieldname);
      if (getIsNullOrUndef(value)) {
        continue;
      }

      filterMap[fieldname] = value;
    }

    return filterMap;
  }

  async set(key: string, value: DocValue, callPostSet = true) {
    const field = this.filters.find((f) => f.fieldname === key);
    if (field === undefined) {
      return;
    }

    value = Converter.toRawValue(value, field, this.fyo);
    const prevValue = this[key];
    if (prevValue === value) {
      return;
    }

    if (getIsNullOrUndef(value)) {
      delete this[key];
    } else {
      this[key] = value;
    }

    if (callPostSet) {
      await this.updateData(key);
    }
  }

  async updateData(key?: string, force?: boolean) {
    await this.setDefaultFilters();
    this.filters = await this.getFilters();
    this.columns = await this.getColumns();
    await this.setReportData(key, force);
  }

  /**
   * Should first check if filter value is set
   * and update only if it is not set.
   */
  abstract setDefaultFilters(): void | Promise<void>;
  abstract getActions(): Action[];
  abstract getFilters(): Field[] | Promise<Field[]>;
  abstract getColumns(): ColumnField[] | Promise<ColumnField[]>;
  abstract setReportData(filter?: string, force?: boolean): Promise<void>;

  getDrillDownRoute(
    row: ReportRow,
    cellIndex: number
  ): {
    name: string;
    params: Record<string, string>;
    query: Record<string, string>;
  } | null {
    void row;
    void cellIndex;
    return null;
  }

  getPrintMeta(): { subtitle?: string } {
    return {};
  }
}
