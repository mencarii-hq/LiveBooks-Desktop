import { Patch } from '../database/types';
import addUOMs from './addUOMs';
import createInventoryNumberSeries from './createInventoryNumberSeries';
import fixRoundOffAccount from './fixRoundOffAccount';
import testPatch from './testPatch';
import updateSchemas from './updateSchemas';
import setPaymentReferenceType from './setPaymentReferenceType';
import fixLedgerDateTime from './v0_21_0/fixLedgerDateTime';
import fixItemHSNField from './fixItemHSNField';
import createPaymentMethods from './createPaymentMethods';
import uuidIdentityMigration from './uuidIdentityMigration';
import migrateChequeToCheck from './migrateChequeToCheck';
import migrateManualCreditCards from './migrateManualCreditCards';
import partyItemDisplayNames from './partyItemDisplayNames';

export default [
  { name: 'testPatch', version: '0.5.0-beta.0', patch: testPatch },
  {
    name: 'updateSchemas',
    version: '0.5.0-beta.0',
    patch: updateSchemas,
    priority: 100,
  },
  {
    name: 'addUOMs',
    version: '0.6.0-beta.0',
    patch: addUOMs,
  },
  {
    name: 'fixRoundOffAccount',
    version: '0.6.3-beta.0',
    patch: fixRoundOffAccount,
  },
  {
    name: 'createInventoryNumberSeries',
    version: '0.6.6-beta.0',
    patch: createInventoryNumberSeries,
  },
  {
    name: 'setPaymentReferenceType',
    version: '0.20.1',
    patch: setPaymentReferenceType,
  },
  {
    name: 'fixLedgerDateTime',
    version: '0.21.2',
    patch: fixLedgerDateTime,
  },
  { name: 'fixItemHSNField', version: '0.24.0', patch: fixItemHSNField },
  {
    name: 'createPaymentMethods',
    version: '0.25.1',
    patch: createPaymentMethods,
  },
  {
    name: 'uuidIdentityMigration',
    version: '1.0.0',
    patch: uuidIdentityMigration,
    priority: 200,
  },
  {
    name: 'migrateChequeToCheck',
    version: '1.0.3',
    patch: migrateChequeToCheck,
  },
  {
    name: 'partyItemDisplayNames',
    version: '1.0.4',
    patch: partyItemDisplayNames,
    // After uuidIdentityMigration (priority 200) so Tier-C damage is repairable.
    priority: 150,
  },
  {
    // Original Part 3 migration (Credit Cards group + Credit Card Entry refs).
    name: 'migrateManualCreditCards',
    version: '1.0.4',
    patch: migrateManualCreditCards,
  },
  {
    // Widen pass: also convert Bank+Liability under Current Liabilities /
    // Liabilities parents ($0 manual CCs with no JE). Same execute is
    // idempotent; new PatchRun name so already-migrated books re-run.
    name: 'migrateManualCreditCardsWidenParents',
    version: '1.0.4',
    patch: migrateManualCreditCards,
  },
] as Patch[];
