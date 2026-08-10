import type { Knex } from 'knex';
import { ModelNameEnum } from 'models/types';
import { AccountTypeEnum } from 'models/baseModels/Account/types';
import { getDefaultMetaFieldValueMap } from 'backend/helpers';
import { generateDocId } from 'utils/ids';
import {
  buildCoaSeedPath,
  coaSeedSegment,
  systemAccountId,
} from 'utils/ids/systemAccountId';
import { DatabaseManager } from '../database/manager';

/**
 * Desktop 1.0.4 Part 3 — migrate manual credit-card accounts to CreditCard.
 *
 * Manual CC flow previously created Liability accounts with accountType Bank
 * (register/reconcile filters could not distinguish them). Rewrite those rows
 * to accountType CreditCard, and ensure a Credit Cards group exists under
 * Current Liabilities (matching standardCOA).
 */
const CREDIT_CARDS_LABEL = 'Credit Cards';
const CURRENT_LIABILITIES_LABEL = 'Current Liabilities';
const LIABILITIES_LABEL = 'Liabilities';
const CREDIT_CARD_ENTRY_TYPE = 'Credit Card Entry';

/** Deterministic id matching createCOA for English standardCOA labels. */
function creditCardsGroupSystemId(): string {
  return systemAccountId(
    buildCoaSeedPath([
      coaSeedSegment('Liability'),
      coaSeedSegment('Source of Funds (Liabilities)'),
      coaSeedSegment(CURRENT_LIABILITIES_LABEL),
      coaSeedSegment(CREDIT_CARDS_LABEL),
    ])
  );
}

function isTruthyGroup(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}

type OutboxMutation = {
  schemaName: string;
  docName: string;
  operation: 'insert' | 'update';
  payload: Record<string, unknown>;
};

/**
 * Patches write via knex, which bypasses the fyo-layer LocalMutation logger.
 * Enqueue equivalent outbox rows so synced devices converge (and a stale
 * pre-migration mutation replaying from another device cannot silently win).
 * Only enqueue when the outbox is already in use: books that never synced
 * have no rows, and deviceId / bookId are only knowable from prior rows.
 */
async function enqueueOutboxMutations(
  knex: Knex,
  mutations: OutboxMutation[]
): Promise<void> {
  if (!mutations.length) {
    return;
  }
  if (!(await knex.schema.hasTable(ModelNameEnum.LocalMutation))) {
    return;
  }

  const latest = (await knex(ModelNameEnum.LocalMutation)
    .select('deviceId', 'bookId', 'clientSeq')
    .orderBy('clientSeq', 'desc')
    .first()) as
    | { deviceId?: string; bookId?: string; clientSeq?: number }
    | undefined;
  if (!latest?.deviceId || !latest.bookId) {
    return;
  }

  let clientSeq = Number(latest.clientSeq ?? 0);
  const rows = mutations.map((m) => ({
    ...getDefaultMetaFieldValueMap(),
    name: generateDocId(),
    mutationId: generateDocId(),
    schemaName: m.schemaName,
    docName: m.docName,
    operation: m.operation,
    payload: JSON.stringify(m.payload),
    deviceId: latest.deviceId,
    bookId: latest.bookId,
    clientSeq: ++clientSeq,
    syncStatus: 'pending',
    createdAt: new Date().toISOString(),
  }));
  await knex(ModelNameEnum.LocalMutation).insert(rows);
}

async function execute(dm: DatabaseManager) {
  const knex = dm.db?.knex;
  if (!knex) {
    return;
  }

  const hasAccount = await knex.schema.hasTable('Account');
  if (!hasAccount) {
    return;
  }

  const outbox: OutboxMutation[] = [];

  // 1. Manual CC accounts → CreditCard (idempotent). Convert leaf
  // Bank+Liability accounts the manual credit-card flow could have created:
  // parented under Credit Cards / Current Liabilities / Liabilities (create
  // fallbacks), or referenced by a Credit Card Entry journal entry. Other
  // Bank-typed liabilities (e.g. a bank overdraft under a custom parent)
  // keep their type.
  const candidates = (await knex('Account')
    .select('name', 'parentAccount')
    .where({
      accountType: AccountTypeEnum.Bank,
      rootType: 'Liability',
      isGroup: false,
    })) as { name: string; parentAccount?: string | null }[];

  if (candidates.length) {
    const ccGroups = (await knex('Account')
      .select('name')
      .where({ isGroup: true })
      .andWhere(function () {
        void this.where({ accountName: CREDIT_CARDS_LABEL })
          .orWhere({ name: CREDIT_CARDS_LABEL })
          .orWhere({ name: creditCardsGroupSystemId() });
      })) as { name: string }[];
    const ccGroupNames = new Set(ccGroups.map((g) => g.name));

    // manualBankAccountCreate parent fallbacks when Credit Cards is missing.
    const liabilityParents = (await knex('Account')
      .select('name')
      .where({ isGroup: true })
      .andWhere(function () {
        void this.where({ accountName: CURRENT_LIABILITIES_LABEL })
          .orWhere({ name: CURRENT_LIABILITIES_LABEL })
          .orWhere({ accountName: LIABILITIES_LABEL })
          .orWhere({ name: LIABILITIES_LABEL });
      })) as { name: string }[];
    const liabilityParentNames = new Set(liabilityParents.map((g) => g.name));

    const ccEntryAccounts = new Set<string>();
    if (
      (await knex.schema.hasTable('JournalEntry')) &&
      (await knex.schema.hasTable('JournalEntryAccount'))
    ) {
      const rows = (await knex('JournalEntryAccount')
        .join('JournalEntry', 'JournalEntryAccount.parent', 'JournalEntry.name')
        .where('JournalEntry.entryType', CREDIT_CARD_ENTRY_TYPE)
        .distinct('JournalEntryAccount.account as account')) as {
        account: string;
      }[];
      for (const r of rows) {
        ccEntryAccounts.add(r.account);
      }
    }

    const converted = candidates
      .filter(
        (a) =>
          (a.parentAccount != null &&
            (ccGroupNames.has(a.parentAccount) ||
              liabilityParentNames.has(a.parentAccount))) ||
          ccEntryAccounts.has(a.name)
      )
      .map((a) => a.name);

    if (converted.length) {
      await knex('Account')
        .whereIn('name', converted)
        .update({ accountType: AccountTypeEnum.CreditCard });
      for (const name of converted) {
        outbox.push({
          schemaName: ModelNameEnum.Account,
          docName: name,
          operation: 'update',
          payload: { name, accountType: AccountTypeEnum.CreditCard },
        });
      }
    }
  }

  // 2. Ensure Credit Cards group under Current Liabilities.
  const groupSystemId = creditCardsGroupSystemId();

  const bySystemId = (await knex('Account')
    .where({ name: groupSystemId })
    .first()) as
    | {
        name: string;
        accountType?: string | null;
        isGroup?: number | boolean | null;
        rootType?: string | null;
      }
    | undefined;

  const byLabelGroup = (await knex('Account')
    .where({ isGroup: true })
    .andWhere(function () {
      void this.where({ accountName: CREDIT_CARDS_LABEL }).orWhere({
        name: CREDIT_CARDS_LABEL,
      });
    })
    .first()) as
    | {
        name: string;
        accountType?: string | null;
        isGroup?: number | boolean | null;
        rootType?: string | null;
      }
    | undefined;

  const existingGroup = bySystemId ?? byLabelGroup;

  if (existingGroup) {
    const patch: Record<string, unknown> = {};
    if (existingGroup.accountType !== AccountTypeEnum.CreditCard) {
      patch.accountType = AccountTypeEnum.CreditCard;
    }
    if (!isTruthyGroup(existingGroup.isGroup)) {
      patch.isGroup = true;
    }
    if (existingGroup.rootType !== 'Liability') {
      patch.rootType = 'Liability';
    }
    if (Object.keys(patch).length) {
      await knex('Account').where({ name: existingGroup.name }).update(patch);
      outbox.push({
        schemaName: ModelNameEnum.Account,
        docName: existingGroup.name,
        operation: 'update',
        payload: { name: existingGroup.name, ...patch },
      });
    }
    await enqueueOutboxMutations(knex, outbox);
    return;
  }

  // A leaf already named "Credit Cards" — do not promote it; parent fallbacks
  // in manualBankAccountCreate still resolve Current Liabilities.
  const leafNamedCreditCards = (await knex('Account')
    .where({ isGroup: false })
    .andWhere(function () {
      void this.where({ accountName: CREDIT_CARDS_LABEL }).orWhere({
        name: CREDIT_CARDS_LABEL,
      });
    })
    .first()) as { name: string } | undefined;
  if (leafNamedCreditCards) {
    await enqueueOutboxMutations(knex, outbox);
    return;
  }

  const currentLiabilities = (await knex('Account')
    .where({ isGroup: true, rootType: 'Liability' })
    .andWhere(function () {
      void this.where({ accountName: CURRENT_LIABILITIES_LABEL }).orWhere({
        name: CURRENT_LIABILITIES_LABEL,
      });
    })
    .first()) as { name: string } | undefined;

  if (!currentLiabilities) {
    // Older / custom COAs may lack the standard label; skip group seed.
    await enqueueOutboxMutations(knex, outbox);
    return;
  }

  const groupRow = {
    name: groupSystemId,
    accountName: CREDIT_CARDS_LABEL,
    parentAccount: currentLiabilities.name,
    isGroup: true,
    rootType: 'Liability',
    accountType: AccountTypeEnum.CreditCard,
    ...getDefaultMetaFieldValueMap(),
  };
  await dm.db?.insert(ModelNameEnum.Account, groupRow);
  outbox.push({
    schemaName: ModelNameEnum.Account,
    docName: groupSystemId,
    operation: 'insert',
    payload: groupRow,
  });
  await enqueueOutboxMutations(knex, outbox);
}

export default { execute };
