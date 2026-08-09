import { HiddenMap } from 'fyo/model/types';
import { Party as BaseParty } from 'models/baseModels/Party/Party';
import { GSTType } from './types';
import { isWorkforcePartyRole, PartyRole } from 'models/baseModels/Party/types';

export class Party extends BaseParty {
  gstin?: string;
  role?: PartyRole;
  gstType?: GSTType;
  loyaltyProgram?: string;

  async beforeSync() {
    // Must run base UUID PK + partyName assignment before regional GST cleanup.
    await super.beforeSync();

    const gstin = this.get('gstin') as string | undefined;
    const gstType = this.get('gstType') as GSTType;

    if (gstin && gstType !== 'Registered Regular') {
      this.gstin = '';
    }
  }

  hidden: HiddenMap = {
    defaultAccount: () => isWorkforcePartyRole(this.role),
    gstin: () =>
      isWorkforcePartyRole(this.role) ||
      (this.gstType as GSTType) !== 'Registered Regular',
    gstType: () => isWorkforcePartyRole(this.role),
    currency: () => isWorkforcePartyRole(this.role),
    loyaltyProgram: () => {
      if (!this.fyo.singles.AccountingSettings?.enableLoyaltyProgram) {
        return true;
      }
      return this.role === 'Supplier' || isWorkforcePartyRole(this.role);
    },
    loyaltyPoints: () =>
      !this.loyaltyProgram ||
      this.role === 'Supplier' ||
      isWorkforcePartyRole(this.role),
    fromLead: () =>
      !this.fyo.singles.AccountingSettings?.enableLead ||
      isWorkforcePartyRole(this.role),
  };
}
