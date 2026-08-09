import { Fyo } from 'fyo';
import { Doc } from 'fyo/model/doc';
import {
  Action,
  LeadStatus,
  ListViewSettings,
  ValidationMap,
} from 'fyo/model/types';
import { getLeadActions, getLeadStatusColumn } from 'models/helpers';
import {
  validateEmail,
  validatePhoneNumber,
} from 'fyo/model/validationFunction';
import { ModelNameEnum } from 'models/types';

export class Lead extends Doc {
  status?: LeadStatus;

  validations: ValidationMap = {
    email: validateEmail,
    mobile: validatePhoneNumber,
  };

  createCustomer() {
    const { name, mobile, ...rest } = this.getValidDict();
    return this.fyo.doc.getNewDoc(ModelNameEnum.Party, {
      ...rest,
      partyName: name,
      fromLead: this.name,
      phone: mobile as string,
      role: 'Customer',
    });
  }

  createSalesQuote() {
    const data: { party: string | undefined; referenceType: string } = {
      party: this.name,
      referenceType: ModelNameEnum.Lead,
    };

    return this.fyo.doc.getNewDoc(ModelNameEnum.SalesQuote, data);
  }

  static getActions(fyo: Fyo): Action[] {
    return getLeadActions(fyo);
  }

  static getListViewSettings(): ListViewSettings {
    return {
      columns: ['name', getLeadStatusColumn(), 'email', 'mobile'],
    };
  }
}
