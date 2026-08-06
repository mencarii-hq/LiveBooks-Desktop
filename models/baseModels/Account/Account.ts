import { Fyo } from 'fyo';
import { Doc } from 'fyo/model/doc';
import { generateDocId, isUuidDocId } from 'utils/ids';
import {
  DefaultMap,
  FiltersMap,
  HiddenMap,
  ListViewSettings,
  RequiredMap,
  TreeViewSettings,
  ReadOnlyMap,
  FormulaMap,
} from 'fyo/model/types';
import { ModelNameEnum } from 'models/types';
import { QueryFilter } from 'utils/db/types';
import { ValidationError } from 'fyo/utils/errors';
import { AccountRootType, AccountRootTypeEnum, AccountType } from './types';

/** Matches LiveBooks standardCOA placements (not generic ERPNext guesses). */
const ACCOUNT_TYPE_ROOT_TYPE_MAP: Record<string, string> = {
  Bank: 'Asset',
  Cash: 'Asset',
  Receivable: 'Asset',
  'Fixed Asset': 'Asset',
  Stock: 'Asset',
  Temporary: 'Asset',
  'Accumulated Depreciation': 'Asset',
  Payable: 'Liability',
  'Stock Received But Not Billed': 'Liability',
  Tax: 'Liability',
  Equity: 'Equity',
  'Income Account': 'Income',
  // Chargeable + Stock Adjustment live under Expenses in standardCOA.
  Chargeable: 'Expense',
  'Expense Account': 'Expense',
  'Cost of Goods Sold': 'Expense',
  Depreciation: 'Expense',
  'Expenses Included In Valuation': 'Expense',
  'Stock Adjustment': 'Expense',
  'Round Off': 'Expense',
};

/**
 * CORE ACCOUNTING ENGINE — CRITICAL
 * This class affects double-entry postings (debits/credits/balances).
 * Do NOT change its logic without explicit approval from the developer.
 * A wrong change here silently corrupts the books.
 */
export class Account extends Doc {
  accountName?: string;
  rootType?: AccountRootType;
  accountType?: AccountType;
  parentAccount?: string;
  /** When true, account is treated as archived (hidden from feeds and active pickers). */
  disabled?: boolean;
  /** Next check number assigned when printing checks (Bank accounts only). */
  nextCheckNumber?: number;
  /** JSON array of voided check numbers; never reused (Bank accounts only). */
  voidedCheckNumbers?: string;

  /** Check numbering fields are only meaningful for Bank accounts. */
  hidden: HiddenMap = {
    nextCheckNumber: () => this.accountType !== 'Bank',
    voidedCheckNumbers: () => this.accountType !== 'Bank',
  };

  get isDebit() {
    if (this.rootType === AccountRootTypeEnum.Asset) {
      return true;
    }

    if (this.rootType === AccountRootTypeEnum.Expense) {
      return true;
    }

    return false;
  }

  get isCredit() {
    return !this.isDebit;
  }

  required: RequiredMap = {
    /**
     * Child accounts need a parent after setup. Root accounts are created
     * during initialization with no parent — keep them editable (e.g. rename)
     * without forcing parentAccount.
     */
    parentAccount: () => {
      if (!this.fyo.singles?.AccountingSettings?.setupComplete) {
        return false;
      }
      // Existing roots intentionally have no parent.
      if (this.inserted && !this.parentAccount) {
        return false;
      }
      return true;
    },
  };

  static defaults: DefaultMap = {
    /**
     * NestedSet indices are actually not used
     * this needs updation as they may be required
     * later on.
     */
    lft: () => 0,
    rgt: () => 0,
  };

  async beforeSync() {
    if (this.name && !isUuidDocId(this.name)) {
      this.accountName ??= this.name;
      this.name = generateDocId();
    } else if (!this.name) {
      this.name = generateDocId();
    }

    if (typeof this.accountName === 'string') {
      this.accountName = this.accountName.trim();
    }

    // Hard-block duplicate accountName (case-insensitive)
    if (this.accountName) {
      const normalizedName = this.accountName.toLowerCase();
      const allAccounts = (await this.fyo.db.getAll(ModelNameEnum.Account, {
        fields: ['name', 'accountName'],
      })) as { name: string; accountName?: string }[];
      const duplicate = allAccounts.find(
        (a) =>
          a.name !== this.name &&
          a.accountName &&
          a.accountName.trim().toLowerCase() === normalizedName
      );
      if (duplicate) {
        throw new ValidationError(
          'Account name must be unique. Rename with a prefix or suffix to continue.'
        );
      }
    }

    if (this.inserted && this.name) {
      const persisted = (await this.fyo.db.get(
        ModelNameEnum.Account,
        this.name
      )) as { parentAccount?: string } | null;

      if (!this.parentAccount) {
        // Clearing parent on a non-root would orphan the account outside the tree.
        if (persisted?.parentAccount) {
          throw new ValidationError(
            'Child accounts must keep a parent. Clearing parent is not allowed.'
          );
        }
        // Persisted roots stay parentless.
        return;
      }

      // Persisted roots must stay parentless (cannot demote Asset/Liability/…).
      if (persisted && !persisted.parentAccount) {
        throw new ValidationError('Root accounts must stay without a parent.');
      }
    } else if (!this.parentAccount) {
      return;
    }

    if (this.parentAccount === this.name) {
      throw new ValidationError('An account cannot be its own parent.');
    }

    // Walk parent chain: validate immediate parent, detect cycles.
    const visited = new Set<string>([this.name]);
    let current: string | undefined = this.parentAccount;
    let immediateParent: {
      rootType?: string;
      accountType?: string;
      isGroup?: boolean;
      parentAccount?: string;
    } | null = null;

    while (current) {
      if (visited.has(current)) {
        throw new ValidationError(
          'Circular parent chain detected. An account cannot be a descendant of itself.'
        );
      }
      visited.add(current);

      const parentDoc = (await this.fyo.db.get(
        ModelNameEnum.Account,
        current
      )) as {
        rootType?: string;
        accountType?: string;
        isGroup?: boolean;
        parentAccount?: string;
      } | null;

      if (!parentDoc) {
        throw new ValidationError(
          `Parent account "${current}" does not exist.`
        );
      }

      if (!immediateParent) {
        immediateParent = parentDoc;
        if (!parentDoc.isGroup) {
          throw new ValidationError(
            `Parent account "${this.parentAccount}" is not a group account.`
          );
        }
      }

      current = parentDoc.parentAccount;
    }

    if (!immediateParent) {
      return;
    }

    // accountType / rootType vs parent rootType compatibility
    if (immediateParent.rootType) {
      if (this.accountType) {
        const expectedRootType = ACCOUNT_TYPE_ROOT_TYPE_MAP[this.accountType];
        if (expectedRootType && expectedRootType !== immediateParent.rootType) {
          throw new ValidationError(
            `Account type "${this.accountType}" is not compatible with parent root type "${immediateParent.rootType}". ` +
              `Expected root type: "${expectedRootType}".`
          );
        }
      } else if (this.rootType && this.rootType !== immediateParent.rootType) {
        // Groups often have no accountType; still block cross-rootType reparent.
        throw new ValidationError(
          `Account root type "${this.rootType}" is not compatible with parent root type "${immediateParent.rootType}".`
        );
      }
    }

    // Inherit type from parent for leaves only — do not stamp groups.
    if (!this.accountType && !this.isGroup && immediateParent.accountType) {
      this.accountType = immediateParent.accountType as AccountType;
    }
  }

  static getListViewSettings(): ListViewSettings {
    return {
      columns: ['accountName', 'rootType', 'isGroup', 'parentAccount'],
    };
  }

  static getTreeSettings(fyo: Fyo): void | TreeViewSettings {
    return {
      parentField: 'parentAccount',
      async getRootLabel(): Promise<string> {
        const accountingSettings = await fyo.doc.getDoc('AccountingSettings');
        return accountingSettings.companyName as string;
      },
    };
  }

  formulas: FormulaMap = {
    rootType: {
      formula: async () => {
        if (!this.parentAccount) {
          return;
        }

        return await this.fyo.getValue(
          ModelNameEnum.Account,
          this.parentAccount,
          'rootType'
        );
      },
    },
  };

  static filters: FiltersMap = {
    parentAccount: (doc: Doc) => {
      const filter: QueryFilter = {
        isGroup: true,
      };

      if (doc?.rootType) {
        filter.rootType = doc.rootType as string;
      }

      return filter;
    },
  };

  readOnly: ReadOnlyMap = {
    rootType: () => this.inserted,
    // Roots stay parentless; children remain reparentable.
    parentAccount: () => this.inserted && !this.parentAccount,
    accountType: () => !!this.accountType && this.inserted,
    isGroup: () => this.inserted,
  };
}
