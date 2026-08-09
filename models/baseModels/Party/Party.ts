import { Fyo } from 'fyo';
import { Doc } from 'fyo/model/doc';
import {
  Action,
  FiltersMap,
  FormulaMap,
  HiddenMap,
  ListsMap,
  ListViewSettings,
  ValidationMap,
} from 'fyo/model/types';
import {
  validateEmail,
  validatePhoneNumber,
} from 'fyo/model/validationFunction';
import { ValidationError } from 'fyo/utils/errors';
import { Money } from 'pesa';
import { isWorkforcePartyRole, PartyRole } from './types';
import { ModelNameEnum } from 'models/types';
import { isLoyaltyProgramExpiredAndMaxed } from 'models/helpers';
import {
  creditorsAccountId,
  debtorsAccountId,
} from 'utils/ids/coaAccountLookup';
import { generateDocId, isUuidDocId } from 'utils/ids';

export class Party extends Doc {
  role?: PartyRole;
  party?: string;
  partyName?: string;
  fromLead?: string;
  defaultAccount?: string;
  loyaltyPoints?: number;
  outstandingAmount?: Money;

  async beforeSync() {
    // Only assign/rewrite the PK on insert. Changing `name` on an already
    // inserted doc would update against a non-existent row (#updateOne uses
    // the current name as the WHERE key and does not rename the PK).
    if (!this.inserted) {
      if (this.name && !isUuidDocId(this.name)) {
        // Temp UI ids look like "New Customers & Suppliers 02" — never promote
        // those into partyName (display name / dialogs use that field).
        if (!this.fyo.doc.isTemporaryName(this.name, this.schema)) {
          this.partyName ??= this.name;
        }
        this.name = generateDocId();
      } else if (!this.name) {
        this.name = generateDocId();
      }
    }

    if (typeof this.partyName === 'string') {
      this.partyName = this.partyName.trim();
    }

    // Hard-block duplicate partyName (case-insensitive) on create/rename.
    // Existing books may already have case-insensitive duplicates; allow those
    // parties to keep saving as long as partyName is unchanged.
    let persisted: { partyName?: string } | null = null;
    if (this.inserted && this.name) {
      persisted = (await this.fyo.db.get(ModelNameEnum.Party, this.name)) as {
        partyName?: string;
      } | null;
    }

    if (this.partyName) {
      const normalizedName = this.partyName.toLowerCase();
      const nameUnchanged =
        !!persisted?.partyName &&
        persisted.partyName.trim().toLowerCase() === normalizedName;

      if (!nameUnchanged) {
        const allParties = (await this.fyo.db.getAll(ModelNameEnum.Party, {
          fields: ['name', 'partyName'],
        })) as { name: string; partyName?: string }[];
        const duplicate = allParties.find(
          (p) =>
            p.name !== this.name &&
            p.partyName &&
            p.partyName.trim().toLowerCase() === normalizedName
        );
        if (duplicate) {
          const role = this.role;
          const typeLabel =
            role === 'Employee' || role === 'Contractor'
              ? 'Employee'
              : role === 'Customer'
              ? 'Customer'
              : role === 'Supplier'
              ? 'Supplier'
              : 'Customer/Supplier';
          throw new ValidationError(
            `${typeLabel} name must be unique. Rename with a prefix or suffix to continue.`
          );
        }
      }
    }
  }
  async updateOutstandingAmount() {
    /**
     * If Role === "Both" then outstanding Amount
     * will be the amount to be paid to the party.
     */

    const role = this.role as PartyRole;
    let outstandingAmount = this.fyo.pesa(0);

    if (isWorkforcePartyRole(role)) {
      await this.setAndSync({ outstandingAmount });
      return;
    }

    if (role === 'Customer' || role === 'Both') {
      const outstandingReceive = await this._getTotalOutstandingAmount(
        'SalesInvoice'
      );
      outstandingAmount = outstandingAmount.add(outstandingReceive);
    }

    if (role === 'Supplier') {
      const outstandingPay = await this._getTotalOutstandingAmount(
        'PurchaseInvoice'
      );
      outstandingAmount = outstandingAmount.add(outstandingPay);
    }

    if (role === 'Both') {
      const outstandingPay = await this._getTotalOutstandingAmount(
        'PurchaseInvoice'
      );
      outstandingAmount = outstandingAmount.sub(outstandingPay);
    }

    await this.setAndSync({ outstandingAmount });
  }

  async updateLoyaltyPoints() {
    let loyaltyPoints = 0;

    if (this.role === 'Customer' || this.role === 'Both') {
      loyaltyPoints = await this._getTotalLoyaltyPoints();
    }

    await this.setAndSync({ loyaltyPoints });
  }

  async _getTotalLoyaltyPoints() {
    const loyaltyProgramName = this.loyaltyProgram as string;
    if (loyaltyProgramName) {
      const isExpiredAndMaxed = await isLoyaltyProgramExpiredAndMaxed(
        this.fyo,
        loyaltyProgramName
      );
      if (isExpiredAndMaxed) {
        return 0;
      }
    }

    const data = (await this.fyo.db.getAll(ModelNameEnum.LoyaltyPointEntry, {
      fields: ['name', 'loyaltyPoints', 'expiryDate', 'postingDate'],
      filters: {
        customer: this.name as string,
      },
    })) as {
      name: string;
      loyaltyPoints: number;
      expiryDate: Date;
      postingDate: Date;
    }[];

    const totalLoyaltyPoints = data.reduce((total, entry) => {
      if (entry.expiryDate > entry.postingDate) {
        return total + entry.loyaltyPoints;
      }

      return total;
    }, 0);

    return totalLoyaltyPoints;
  }

  async _getTotalOutstandingAmount(
    schemaName: 'SalesInvoice' | 'PurchaseInvoice'
  ) {
    const outstandingAmounts = await this.fyo.db.getAllRaw(schemaName, {
      fields: ['outstandingAmount'],
      filters: {
        submitted: true,
        cancelled: false,
        party: this.name as string,
      },
    });

    return outstandingAmounts
      .map(({ outstandingAmount }) =>
        this.fyo.pesa(outstandingAmount as number)
      )
      .reduce((a, b) => a.add(b), this.fyo.pesa(0));
  }

  formulas: FormulaMap = {
    defaultAccount: {
      formula: async () => {
        const role = this.role as PartyRole;
        if (role === 'Both' || isWorkforcePartyRole(role)) {
          return '';
        }

        const accountId =
          role === 'Supplier'
            ? creditorsAccountId(this.fyo)
            : debtorsAccountId(this.fyo);

        const accountExists = await this.fyo.db.exists('Account', accountId);
        return accountExists ? accountId : '';
      },
      dependsOn: ['role'],
    },
    currency: {
      formula: () => {
        if (!this.currency) {
          return this.fyo.singles.SystemSettings!.currency as string;
        }
      },
    },
  };

  validations: ValidationMap = {
    email: validateEmail,
    phone: validatePhoneNumber,
  };

  hidden: HiddenMap = {
    defaultAccount: () => isWorkforcePartyRole(this.role),
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
    currency: () => isWorkforcePartyRole(this.role),
    taxId: () => isWorkforcePartyRole(this.role),
  };

  static lists: ListsMap = {
    role: (doc) => {
      const workforce = [
        { value: 'Employee', label: 'Employee' },
        { value: 'Contractor', label: 'Contractor' },
      ];
      const trade = [
        { value: 'Both', label: 'Both' },
        { value: 'Supplier', label: 'Supplier' },
        { value: 'Customer', label: 'Customer' },
      ];
      const role = doc?.role as PartyRole | undefined;
      if (isWorkforcePartyRole(role)) {
        return workforce;
      }
      if (role === 'Customer' || role === 'Supplier' || role === 'Both') {
        return trade;
      }
      return [...trade, ...workforce];
    },
  };

  static filters: FiltersMap = {
    defaultAccount: (doc: Doc) => {
      const role = doc.role as PartyRole;
      if (isWorkforcePartyRole(role)) {
        // Employees/contractors are paid via Payroll / register category — not AR/AP.
        return {
          isGroup: false,
          accountType: '__none__',
        };
      }
      if (role === 'Both') {
        return {
          isGroup: false,
          accountType: ['in', ['Payable', 'Receivable']],
        };
      }

      return {
        isGroup: false,
        accountType: role === 'Customer' ? 'Receivable' : 'Payable',
      };
    },
  };

  static getListViewSettings(): ListViewSettings {
    return {
      columns: ['partyName', 'email', 'phone', 'outstandingAmount'],
    };
  }

  async afterDelete() {
    await super.afterDelete();
    if (!this.fromLead) {
      return;
    }
    const leadData = await this.fyo.doc.getDoc(
      ModelNameEnum.Lead,
      this.fromLead
    );
    await leadData.setAndSync('status', 'Interested');
  }

  async afterSync() {
    await super.afterSync();
    if (!this.fromLead) {
      return;
    }

    const leadData = await this.fyo.doc.getDoc(
      ModelNameEnum.Lead,
      this.fromLead
    );
    await leadData.setAndSync('status', 'Converted');
  }

  static getActions(fyo: Fyo): Action[] {
    return [
      {
        label: fyo.t`Create Purchase`,
        condition: (doc: Doc) =>
          !doc.notInserted &&
          ((doc.role as PartyRole) === 'Supplier' ||
            (doc.role as PartyRole) === 'Both'),
        action: async (partyDoc, router) => {
          const doc = fyo.doc.getNewDoc('PurchaseInvoice', {
            party: partyDoc.name,
            account: partyDoc.defaultAccount as string,
          });

          await router.push({
            path: `/edit/PurchaseInvoice/${doc.name!}`,
            query: {
              schemaName: 'PurchaseInvoice',
              values: {
                // @ts-ignore
                party: partyDoc.name!,
              },
            },
          });
        },
      },
      {
        label: fyo.t`View Purchases`,
        condition: (doc: Doc) =>
          !doc.notInserted &&
          ((doc.role as PartyRole) === 'Supplier' ||
            (doc.role as PartyRole) === 'Both'),
        action: async (partyDoc, router) => {
          await router.push({
            path: '/list/PurchaseInvoice',
            query: { filters: JSON.stringify({ party: partyDoc.name }) },
          });
        },
      },
      {
        label: fyo.t`Create Sale`,
        condition: (doc: Doc) =>
          !doc.notInserted &&
          ((doc.role as PartyRole) === 'Customer' ||
            (doc.role as PartyRole) === 'Both'),
        action: async (partyDoc, router) => {
          const doc = fyo.doc.getNewDoc('SalesInvoice', {
            party: partyDoc.name,
            account: partyDoc.defaultAccount as string,
          });

          await router.push({
            path: `/edit/SalesInvoice/${doc.name!}`,
            query: {
              schemaName: 'SalesInvoice',
              values: {
                // @ts-ignore
                party: partyDoc.name!,
              },
            },
          });
        },
      },
      {
        label: fyo.t`View Sales`,
        condition: (doc: Doc) =>
          !doc.notInserted &&
          ((doc.role as PartyRole) === 'Customer' ||
            (doc.role as PartyRole) === 'Both'),
        action: async (partyDoc, router) => {
          await router.push({
            path: '/list/SalesInvoice',
            query: { filters: JSON.stringify({ party: partyDoc.name }) },
          });
        },
      },
    ];
  }
}
