import { Fyo } from 'fyo';
import {
  AccountRootType,
  COAChildAccount,
  COARootAccount,
  COATree,
} from 'models/baseModels/Account/types';
import { getCOAList } from 'models/baseModels/SetupWizard/SetupWizard';
import {
  buildCoaSeedPath,
  coaSeedSegment,
  systemAccountId,
} from 'utils/ids/systemAccountId';
import { getStandardCOA } from './standardCOA';

const accountFields = ['accountType', 'accountNumber', 'rootType', 'isGroup'];

export class CreateCOA {
  fyo: Fyo;
  chartOfAccounts: string;

  constructor(chartOfAccounts: string, fyo: Fyo) {
    this.chartOfAccounts = chartOfAccounts;
    this.fyo = fyo;
  }

  async run() {
    const chart = await getCOA(this.chartOfAccounts);
    await this.createCOAAccounts(chart, null, '', [], true);
  }

  async createCOAAccounts(
    children: COATree | COARootAccount | COAChildAccount,
    parentAccount: string | null,
    rootType: AccountRootType | '',
    pathSegments: string[],
    rootAccount: boolean
  ) {
    for (const rootName in children) {
      if (accountFields.includes(rootName)) {
        continue;
      }

      const child = children[rootName];

      if (rootAccount) {
        rootType = (child as COARootAccount).rootType;
      }

      const accountType = (child as COAChildAccount).accountType ?? '';
      const segments = [...pathSegments, rootName];
      const seed = buildCoaSeedPath([
        coaSeedSegment(rootType || 'account'),
        ...segments.map(coaSeedSegment),
      ]);
      const accountId = systemAccountId(seed);

      const isGroup = identifyIsGroup(
        child as COAChildAccount | COARootAccount
      );

      const doc = this.fyo.doc.getNewDoc('Account', {
        name: accountId,
        accountName: rootName,
        parentAccount,
        isGroup,
        rootType,
        accountType,
      });

      await doc.sync();
      await this.createCOAAccounts(
        child as COAChildAccount,
        accountId,
        rootType,
        segments,
        false
      );
    }
  }
}

function identifyIsGroup(child: COARootAccount | COAChildAccount): boolean {
  if (child.isGroup !== undefined) {
    return child.isGroup as boolean;
  }

  const keys = Object.keys(child);
  const children = keys.filter((key) => !accountFields.includes(key));

  if (children.length) {
    return true;
  }

  return false;
}

async function getCOA(chartOfAccounts: string): Promise<COATree> {
  const coaList = getCOAList();
  const coa = coaList.find(({ name }) => name === chartOfAccounts);

  const conCode = coa?.countryCode;
  if (!conCode) {
    return getStandardCOA();
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const countryCoa = (await import(`../../fixtures/verified/${conCode}.json`))
      .default as { tree: COATree };
    return countryCoa.tree;
  } catch (e) {
    return getStandardCOA();
  }
}
