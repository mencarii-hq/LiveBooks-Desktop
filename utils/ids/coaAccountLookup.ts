/**
 * Resolve standard chart-of-accounts leaf accounts to deterministic UUID ids
 * (see createCOA / systemAccountId). Use fyo.t labels so paths match setup.
 */

import type { Fyo } from 'fyo';
import { AccountRootTypeEnum } from 'models/baseModels/Account/types';
import { ModelNameEnum } from 'models/types';
import { isUuidDocId } from 'utils/ids';
import {
  buildCoaSeedPath,
  coaSeedSegment,
  systemAccountId,
} from 'utils/ids/systemAccountId';

export function standardCoaAccountId(
  rootType: AccountRootTypeEnum,
  pathLabels: string[]
): string {
  return systemAccountId(
    buildCoaSeedPath([
      coaSeedSegment(rootType),
      ...pathLabels.map(coaSeedSegment),
    ])
  );
}

function assetPath(fyo: Fyo, labels: string[]): string {
  return standardCoaAccountId(AccountRootTypeEnum.Asset, [
    fyo.t`Application of Funds (Assets)`,
    ...labels,
  ]);
}

function liabilityPath(fyo: Fyo, labels: string[]): string {
  return standardCoaAccountId(AccountRootTypeEnum.Liability, [
    fyo.t`Source of Funds (Liabilities)`,
    ...labels,
  ]);
}

function incomePath(fyo: Fyo, labels: string[]): string {
  return standardCoaAccountId(AccountRootTypeEnum.Income, [
    fyo.t`Income`,
    ...labels,
  ]);
}

function expensePath(fyo: Fyo, labels: string[]): string {
  return standardCoaAccountId(AccountRootTypeEnum.Expense, [
    fyo.t`Expenses`,
    ...labels,
  ]);
}

export function debtorsAccountId(fyo: Fyo): string {
  return assetPath(fyo, [
    fyo.t`Current Assets`,
    fyo.t`Accounts Receivable`,
    fyo.t`Debtors`,
  ]);
}

export function cashAccountId(fyo: Fyo): string {
  return assetPath(fyo, [
    fyo.t`Current Assets`,
    fyo.t`Cash In Hand`,
    fyo.t`Cash`,
  ]);
}

export function creditorsAccountId(fyo: Fyo): string {
  return liabilityPath(fyo, [
    fyo.t`Current Liabilities`,
    fyo.t`Accounts Payable`,
    fyo.t`Creditors`,
  ]);
}

export function securedLoansAccountId(fyo: Fyo): string {
  return liabilityPath(fyo, [
    fyo.t`Current Liabilities`,
    fyo.t`Loans (Liabilities)`,
    fyo.t`Secured Loans`,
  ]);
}

export function serviceIncomeAccountId(fyo: Fyo): string {
  return incomePath(fyo, [fyo.t`Direct Income`, fyo.t`Service`]);
}

export function salesIncomeAccountId(fyo: Fyo): string {
  return incomePath(fyo, [fyo.t`Direct Income`, fyo.t`Sales`]);
}

const DEMO_INCOME_LEAF: Record<string, (fyo: Fyo) => string> = {
  Service: (fyo) => incomePath(fyo, [fyo.t`Direct Income`, fyo.t`Service`]),
  Sales: (fyo) => incomePath(fyo, [fyo.t`Direct Income`, fyo.t`Sales`]),
};

const DEMO_EXPENSE_LEAF: Record<string, (fyo: Fyo) => string> = {
  'Cost of Goods Sold': (fyo) =>
    expensePath(fyo, [
      fyo.t`Direct Expenses`,
      fyo.t`Stock Expenses`,
      fyo.t`Cost of Goods Sold`,
    ]),
  'Utility Expenses': (fyo) =>
    expensePath(fyo, [fyo.t`Indirect Expenses`, fyo.t`Utility Expenses`]),
  'Marketing Expenses': (fyo) =>
    expensePath(fyo, [fyo.t`Indirect Expenses`, fyo.t`Marketing Expenses`]),
  'Office Rent': (fyo) =>
    expensePath(fyo, [fyo.t`Indirect Expenses`, fyo.t`Office Rent`]),
  'Office Maintenance Expenses': (fyo) =>
    expensePath(fyo, [
      fyo.t`Indirect Expenses`,
      fyo.t`Office Maintenance Expenses`,
    ]),
};

/** Map demo/items.json incomeAccount or expenseAccount labels to Account.name UUIDs. */
export function resolveDemoCoaAccountId(fyo: Fyo, label: string): string {
  const resolver = DEMO_INCOME_LEAF[label] ?? DEMO_EXPENSE_LEAF[label];
  if (!resolver) {
    throw new Error(`Unknown demo COA account label: ${label}`);
  }
  return resolver(fyo);
}

/** Deterministic COA ids for standard/demo fixture labels (sync). */
export function resolveKnownCoaAccountLabel(
  fyo: Fyo,
  label: string
): string | null {
  switch (label) {
    case 'Debtors':
      return debtorsAccountId(fyo);
    case 'Creditors':
      return creditorsAccountId(fyo);
    case 'Service':
      return serviceIncomeAccountId(fyo);
    case 'Sales':
      return salesIncomeAccountId(fyo);
    default:
      break;
  }
  if (DEMO_INCOME_LEAF[label] ?? DEMO_EXPENSE_LEAF[label]) {
    return resolveDemoCoaAccountId(fyo, label);
  }
  return null;
}

/** Map legacy COA display labels (and demo JSON keys) to Account.name UUIDs. */
export function resolveStandardCoaAccountLabel(
  fyo: Fyo,
  label: string
): string {
  const known = resolveKnownCoaAccountLabel(fyo, label);
  if (known) {
    return known;
  }
  return resolveDemoCoaAccountId(fyo, label);
}

/**
 * Resolve any account reference (UUID, standard COA label, or accountName such
 * as a user-created bank) to Account.name for FK columns.
 */
export async function resolveAccountIdByLabel(
  fyo: Fyo,
  label: string
): Promise<string> {
  const accountRef = { label };

  if (isUuidDocId(accountRef.label)) {
    return accountRef.label;
  }

  const known = resolveKnownCoaAccountLabel(fyo, accountRef.label);
  if (known) {
    return known;
  }

  const rows = (await fyo.db.getAll(ModelNameEnum.Account, {
    fields: ['name'],
    filters: { accountName: accountRef.label },
  })) as { name: string }[];

  if (rows.length === 1) {
    return rows[0].name;
  }

  if (await fyo.db.exists(ModelNameEnum.Account, accountRef.label)) {
    return accountRef.label;
  }

  throw new Error('Unknown account reference');
}
