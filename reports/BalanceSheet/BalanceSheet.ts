import { t } from 'fyo';
import {
  AccountRootType,
  AccountRootTypeEnum,
} from 'models/baseModels/Account/types';
import {
  AccountReport,
  convertAccountRootNodesToAccountList,
} from 'reports/AccountReport';
import {
  CASH_BASIS_NET_INCOME,
  injectCashBasisNetIncomeAccount,
  netIncomeValueMap,
} from 'reports/cashBasis';
import { ReportData, RootTypeRow, AccountNameValueMapMap } from 'reports/types';
import { getMapFromList } from 'utils';
import { QueryFilter } from 'utils/db/types';

export class BalanceSheet extends AccountReport {
  static title = t`Balance Sheet`;
  static reportName = 'balance-sheet';
  loading = false;

  get rootTypes(): AccountRootType[] {
    return [
      AccountRootTypeEnum.Asset,
      AccountRootTypeEnum.Liability,
      AccountRootTypeEnum.Equity,
    ];
  }

  get usesCumulativeBalances(): boolean {
    return this.basis === 'Cash';
  }

  async _getQueryFilters(): Promise<QueryFilter> {
    if (this.basis !== 'Cash') {
      return super._getQueryFilters();
    }

    const filters: QueryFilter = { reverted: false };
    const { toDate } = await this._getFromAndToDates();
    filters.date = ['<', toDate, '>=', '1970-01-01'];
    return filters;
  }

  async setReportData(filter?: string, force?: boolean) {
    this.loading = true;
    if (this.shouldReloadRawData(filter, force)) {
      await this._setRawData();
    }

    const map = this._getGroupedMap(true, 'account');
    const rangeGroupedMap = await this._getGroupedByDateRanges(map);
    if (this.basis === 'Cash') {
      await this._plugCashBasisNetIncome(rangeGroupedMap);
    }
    const accountTree = await this._getAccountTree(rangeGroupedMap);

    for (const name of Object.keys(accountTree)) {
      const { rootType } = accountTree[name];
      if (this.rootTypes.includes(rootType)) {
        continue;
      }

      delete accountTree[name];
    }

    const rootTypeRows: RootTypeRow[] = this.rootTypes
      .map((rootType) => {
        const rootNodes = this.getRootNodes(rootType, accountTree)!;
        const rootList = convertAccountRootNodesToAccountList(rootNodes);
        return {
          rootType,
          rootNodes,
          rows: this.getReportRowsFromAccountList(rootList),
        };
      })
      .filter((row) => !!row.rootNodes.length);

    this.reportData = this.getReportDataFromRows(
      getMapFromList(rootTypeRows, 'rootType')
    );
    this.loading = false;
  }

  async _plugCashBasisNetIncome(rangeGroupedMap: AccountNameValueMapMap) {
    const accountMap = await this._setAndReturnAccountMap();
    injectCashBasisNetIncomeAccount(accountMap);
    const ni = netIncomeValueMap(
      rangeGroupedMap,
      accountMap,
      this._dateRanges ?? []
    );
    rangeGroupedMap.set(CASH_BASIS_NET_INCOME, ni);
  }

  getReportDataFromRows(
    rootTypeRows: Record<AccountRootType, RootTypeRow | undefined>
  ): ReportData {
    const typeNameList = [
      {
        rootType: AccountRootTypeEnum.Asset,
        totalName: t`Total Asset (Debit)`,
      },
      {
        rootType: AccountRootTypeEnum.Liability,
        totalName: t`Total Liability (Credit)`,
      },
      {
        rootType: AccountRootTypeEnum.Equity,
        totalName: t`Total Equity (Credit)`,
      },
    ];

    const reportData: ReportData = [];
    const emptyRow = this.getEmptyRow();
    for (const { rootType, totalName } of typeNameList) {
      const row = rootTypeRows[rootType];
      if (!row) {
        continue;
      }

      reportData.push(...row.rows);

      if (row.rootNodes.length) {
        const totalNode = this.getTotalNode(row.rootNodes, totalName);
        const totalRow = this.getRowFromAccountListNode(totalNode);
        reportData.push(totalRow);
      }

      reportData.push(emptyRow);
    }

    if (reportData.at(-1)?.isEmpty) {
      reportData.pop();
    }

    return reportData;
  }
}
