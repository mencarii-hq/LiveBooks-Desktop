import { Doc } from 'fyo/model/doc';
import { ListViewSettings } from 'fyo/model/types';
import { ModelNameEnum } from 'models/types';
import { Money } from 'pesa';

/**
 * CORE ACCOUNTING ENGINE — CRITICAL
 * This class affects double-entry postings (debits/credits/balances).
 * Do NOT change its logic without explicit approval from the developer.
 * A wrong change here silently corrupts the books.
 */
export class AccountingLedgerEntry extends Doc {
  date?: string | Date;
  account?: string;
  party?: string;
  debit?: Money;
  credit?: Money;
  referenceType?: string;
  referenceName?: string;
  reverted?: boolean;

  async revert() {
    if (this.reverted) {
      return;
    }

    await this.set('reverted', true);
    const revertedEntry = this.fyo.doc.getNewDoc(
      ModelNameEnum.AccountingLedgerEntry,
      {
        account: this.account,
        party: this.party,
        date: new Date(),
        referenceType: this.referenceType,
        referenceName: this.referenceName,
        debit: this.credit,
        credit: this.debit,
        reverted: true,
        reverts: this.name,
      }
    );

    await this.sync();
    await revertedEntry.sync();
  }

  static getListViewSettings(): ListViewSettings {
    return {
      columns: ['date', 'account', 'party', 'debit', 'credit', 'referenceName'],
    };
  }
}
