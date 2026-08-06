import { ModelNameEnum } from 'models/types';
import { AccountTypeEnum } from 'models/baseModels/Account/types';
import { getDefaultMetaFieldValueMap } from 'backend/helpers';
import { DatabaseManager } from '../database/manager';

/**
 * Z1 — Cheque → Check migration.
 *
 * 1. Ensure a `Check` PaymentMethod exists for existing books (new books get
 *    it from createPaymentMethods).
 * 2. Repoint any stored `Cheque` payment-method references to `Check` on
 *    Payment and MemorizedTransaction rows.
 *
 * The stale `'Cheque'` union member in Payment/types.ts is dropped in the same
 * release once stored values have been migrated.
 */
async function execute(dm: DatabaseManager) {
  const knex = dm.db?.knex;
  if (!knex) {
    return;
  }

  // 1. Seed a Check PaymentMethod if it is missing, and retire any legacy
  //    method literally named "Cheque" (rename it if Check does not exist yet,
  //    otherwise remove it after repointing references below).
  const existing = (await dm.db?.getAll(ModelNameEnum.PaymentMethod, {
    fields: ['name', 'type'],
  })) as { name: string; type?: string }[] | undefined;

  let hasCheck = (existing ?? []).some(
    (m) => m.type === 'Check' || m.name.trim().toLowerCase() === 'check'
  );
  const chequeRow = (existing ?? []).find(
    (m) => m.name.trim().toLowerCase() === 'cheque'
  );

  if (chequeRow && !hasCheck) {
    // Rename the legacy method in place, preserving its linked account.
    await knex('PaymentMethod')
      .where({ name: chequeRow.name })
      .update({ name: 'Check', type: 'Check' });
    hasCheck = true;
  } else if (chequeRow && hasCheck) {
    // A Check method already exists — drop the duplicate legacy row.
    // Payment / MemorizedTransaction references are repointed below.
    await knex('PaymentMethod').where({ name: chequeRow.name }).delete();
  }

  if (!hasCheck) {
    const banks = (await dm.db?.getAll(ModelNameEnum.Account, {
      fields: ['name'],
      filters: { accountType: AccountTypeEnum.Bank },
    })) as { name: string }[] | undefined;

    await dm.db?.insert(ModelNameEnum.PaymentMethod, {
      name: 'Check',
      type: 'Check',
      account: banks?.[0]?.name,
      ...getDefaultMetaFieldValueMap(),
    });
  }

  // 2. Migrate stored Cheque references to Check (match the legacy row's
  //    exact name too, in case its casing differed from "Cheque").
  const legacyNames = [
    ...new Set(['Cheque', ...(chequeRow ? [chequeRow.name] : [])]),
  ];

  await knex('Payment')
    .whereIn('paymentMethod', legacyNames)
    .update({ paymentMethod: 'Check' });

  const hasMemorized = await knex.schema.hasTable('MemorizedTransaction');
  if (hasMemorized) {
    await knex('MemorizedTransaction')
      .whereIn('paymentMethod', legacyNames)
      .update({ paymentMethod: 'Check' });
  }
}

export default { execute };
