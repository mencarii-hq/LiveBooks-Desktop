<template>
  <div class="flex flex-col overflow-y-hidden h-full">
    <PageHeader :title="t`Bank Feed`">
      <template #left>
        <div
          class="
            inline-flex
            border
            rounded
            overflow-hidden
            dark:border-gray-700
          "
        >
          <button
            type="button"
            class="px-3 py-1.5 text-sm"
            :class="
              hubTab === 'manual'
                ? 'bg-gray-200 dark:bg-gray-700 font-medium'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-100'
            "
            @click="setHubTab('manual')"
          >
            {{ t`Manual` }}
          </button>
          <button
            type="button"
            class="px-3 py-1.5 text-sm border-s dark:border-gray-700"
            :class="
              hubTab === 'online'
                ? 'bg-gray-200 dark:bg-gray-700 font-medium'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-100'
            "
            @click="setHubTab('online')"
          >
            {{ t`Online` }}
          </button>
        </div>
      </template>
      <Button
        v-if="hubTab === 'manual' && archivedManualBankAccounts.length"
        type="secondary"
        @click="showArchived = !showArchived"
      >
        {{ showArchived ? t`Hide archived` : t`Show archived` }}
      </Button>
      <Button
        v-if="hubTab === 'manual'"
        type="primary"
        @click="openManualSetup"
      >
        {{ t`Add bank` }}
      </Button>
      <template v-else>
        <label
          class="
            inline-flex
            items-center
            gap-1.5
            text-sm text-gray-700
            dark:text-gray-200
            border
            dark:border-gray-700
            rounded-md
            px-2.5
            h-8
            bg-white
            dark:bg-gray-800
            cursor-pointer
            select-none
          "
          :title="autostageTip"
        >
          <input
            type="checkbox"
            class="accent-green-600"
            :checked="plaidAutoStageImportBatches"
            @change="togglePlaidAutoStage"
          />
          <span>{{ t`Autostage` }}</span>
          <span
            class="
              inline-flex
              items-center
              justify-center
              w-3.5
              h-3.5
              rounded-full
              border border-gray-300
              dark:border-gray-600
              text-[10px]
              font-bold
              text-gray-500
            "
            :title="autostageTip"
            >i</span
          >
        </label>
        <Button
          type="primary"
          :disabled="plaidLinkBusy || !bookId"
          @click="linkBankWithPlaid()"
        >
          {{ t`Connect via Plaid` }}
        </Button>
      </template>
    </PageHeader>
    <div class="flex flex-1 min-h-0 overflow-hidden">
      <div
        class="
          flex-1
          min-w-0
          overflow-y-auto overflow-x-hidden
          custom-scroll custom-scroll-thumb1
          p-4
        "
      >
        <ManualBankSetupPanel
          ref="manualSetup"
          class="hidden"
          variant="chrome"
          :show-archived-list="false"
          :show-add-button="false"
          @changed="onManualBanksChanged"
        />

        <div
          v-if="accountsLoading || feedsLoading"
          class="text-sm text-gray-600 dark:text-gray-300"
        >
          {{ t`Loading accounts…` }}
        </div>
        <div
          v-else-if="hubTab === 'online' && !visibleBankTables.length"
          class="text-sm text-gray-600 dark:text-gray-300"
        >
          {{
            bookId
              ? t`No online banks connected yet. Use Connect via Plaid above to get started.`
              : t`Online bank feeds use LiveBooks Cloud when your operations need them. Sign in to connect banks via Plaid.`
          }}
        </div>
        <div
          v-else-if="hubTab === 'manual' && !visibleBankTables.length"
          class="text-sm text-gray-600 dark:text-gray-300"
        >
          {{
            archivedManualBankAccounts.length && !showArchived
              ? t`No active manual banks. Use Show archived to see hidden accounts, or Add bank to create one.`
              : t`No manual banks yet. Use Add bank above to create one.`
          }}
        </div>
        <div v-else class="space-y-6">
          <div
            v-for="bank in pagedBankTables"
            :key="bank.itemId"
            class="
              border border-gray-200
              dark:border-gray-700
              rounded-lg
              overflow-hidden
              bg-white
              dark:bg-gray-900
            "
          >
            <table class="min-w-full text-sm text-start">
              <caption
                v-if="bank.kind === 'plaid'"
                class="
                  text-start
                  px-3
                  py-2.5
                  text-base
                  font-semibold
                  text-gray-900
                  dark:text-gray-100
                  bg-gray-50
                  dark:bg-gray-800
                  border-b border-gray-200
                  dark:border-gray-700
                "
              >
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div class="min-w-0 flex-1">
                    {{ bank.bankName }}
                    <span
                      v-if="bank.health"
                      class="
                        inline-block
                        w-2
                        h-2
                        rounded-full
                        ms-2
                        align-middle
                      "
                      :class="{
                        'bg-emerald-500': bank.health === 'ok',
                        'bg-amber-500': bank.health === 'stale',
                        'bg-red-500': bank.health === 'broken',
                      }"
                      :title="
                        bank.health === 'ok'
                          ? t`Connection healthy`
                          : bank.health === 'stale'
                          ? t`No recent sync from your bank.`
                          : t`Connection broken — sign in again.`
                      "
                    />
                    <p
                      v-if="bank.ingestPaused"
                      class="
                        mt-1
                        text-xs
                        font-normal
                        text-amber-700
                        dark:text-amber-300
                      "
                    >
                      {{
                        t`Bank feeds paused — open Desktop and acknowledge old import batches to resume.`
                      }}
                    </p>
                    <span
                      v-if="bank.pendingAtBank > 0"
                      class="
                        ms-2
                        text-xs
                        px-1.5
                        py-0.5
                        rounded
                        bg-blue-100
                        dark:bg-blue-900
                        text-blue-700
                        dark:text-blue-100
                        align-middle
                      "
                      :title="
                        t`Transactions Plaid sent us that are still pending at the bank. They'll arrive once they post.`
                      "
                    >
                      {{ t`${bank.pendingAtBank} pending at bank` }}
                    </span>
                  </div>
                  <Button
                    type="secondary"
                    class="shrink-0 !text-xs"
                    @click.stop="openBankManageDrawer(bank.itemId)"
                  >
                    {{ t`Manage` }}
                  </Button>
                </div>
              </caption>
              <thead class="bg-gray-50 dark:bg-gray-800 text-xs uppercase">
                <tr>
                  <th class="text-start p-3 border-b dark:border-gray-700">
                    {{ t`Bank name` }}
                  </th>
                  <th class="text-start p-3 border-b dark:border-gray-700">
                    {{ t`Bank balance` }}
                  </th>
                  <th class="text-start p-3 border-b dark:border-gray-700">
                    {{ t`Last sync` }}
                  </th>
                  <th class="text-start p-3 border-b dark:border-gray-700">
                    {{ t`To review` }}
                  </th>
                  <th class="text-start p-3 border-b dark:border-gray-700">
                    {{ t`Ledger name` }}
                  </th>
                  <th class="text-start p-3 border-b dark:border-gray-700">
                    {{ t`Ledger balance` }}
                  </th>
                  <th class="text-start p-3 border-b dark:border-gray-700">
                    {{ t`Actions` }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in bank.rows"
                  :key="row.bankAccountId"
                  class="
                    cursor-pointer
                    hover:bg-gray-50
                    dark:hover:bg-gray-850
                    border-b
                    dark:border-gray-800
                    last:border-0
                  "
                  :class="{
                    'bg-blue-50 dark:bg-blue-900':
                      row.ledgerName && selectedAccount === row.ledgerName,
                    'opacity-60': row.archived,
                  }"
                  @click="
                    row.ledgerName && !row.archived
                      ? selectAccount(row.ledgerName)
                      : undefined
                  "
                >
                  <td
                    class="
                      p-3
                      text-start
                      font-medium
                      text-gray-900
                      dark:text-gray-100
                    "
                  >
                    {{ row.bankAccountName }}
                    <span
                      v-if="row.archived"
                      class="
                        ms-2
                        text-xs
                        font-medium
                        text-gray-500
                        dark:text-gray-400
                      "
                    >
                      {{ t`Archived` }}
                    </span>
                  </td>
                  <td class="p-3 text-start tabular-nums">
                    {{ row.bankBalanceLabel ?? t`—` }}
                  </td>
                  <td class="p-3 text-start text-gray-600 dark:text-gray-300">
                    {{ row.lastSyncLabel || t`—` }}
                  </td>
                  <td class="p-3 text-start">
                    <span
                      v-if="row.toReviewCount > 0"
                      class="
                        text-xs
                        font-medium
                        px-2
                        py-0.5
                        rounded-full
                        bg-amber-100
                        text-amber-900
                        dark:bg-amber-900/40 dark:text-amber-100
                      "
                    >
                      {{ row.toReviewCount }}
                    </span>
                    <span v-else class="text-gray-500 dark:text-gray-400"
                      >0</span
                    >
                  </td>
                  <td class="p-3 text-start">
                    {{ row.ledgerAccountLabel ?? t`—` }}
                  </td>
                  <td class="p-3 text-start tabular-nums">
                    {{ row.ledgerBalanceLabel ?? t`—` }}
                  </td>
                  <td class="p-3 text-start whitespace-nowrap" @click.stop>
                    <div
                      class="
                        inline-flex
                        flex-row
                        items-center
                        gap-2
                        flex-nowrap
                      "
                    >
                      <template v-if="row.ledgerName">
                        <template v-if="bank.kind === 'manual' && row.archived">
                          <Button
                            type="secondary"
                            @click="archiveOrDeleteManualBank(row)"
                          >
                            {{ t`Restore` }}
                          </Button>
                        </template>
                        <template v-else-if="bank.kind === 'manual'">
                          <Button
                            type="primary"
                            @click="goImportBankFile(row.ledgerName)"
                          >
                            {{ t`Import file` }}
                          </Button>
                          <Button
                            type="secondary"
                            @click="archiveOrDeleteManualBank(row)"
                          >
                            {{ manualLifecycleLabel(row.ledgerName) }}
                          </Button>
                        </template>
                        <template v-else>
                          <Button
                            type="secondary"
                            class="!text-xs"
                            @click="
                              openAccountManageDrawer(
                                bank.itemId,
                                row.bankAccountId
                              )
                            "
                          >
                            {{ t`Manage` }}
                          </Button>
                        </template>
                      </template>
                      <template v-else>
                        <Button
                          type="secondary"
                          class="!text-xs"
                          @click="
                            openAccountManageDrawer(
                              bank.itemId,
                              row.bankAccountId
                            )
                          "
                        >
                          {{ t`Manage` }}
                        </Button>
                      </template>
                    </div>
                  </td>
                </tr>
                <tr v-if="bank.rows.length === 0">
                  <td
                    class="p-3 text-sm text-gray-600 dark:text-gray-300"
                    colspan="7"
                  >
                    {{ t`No bank accounts were returned for this connection.` }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div
            v-if="showBankPager"
            class="flex items-center justify-end gap-2 text-sm"
          >
            <Button
              type="secondary"
              :disabled="bankPage <= 0"
              @click="bankPage = Math.max(0, bankPage - 1)"
            >
              {{ t`Previous` }}
            </Button>
            <span class="text-gray-600 dark:text-gray-300">
              {{ t`Page` }} {{ bankPage + 1 }} / {{ bankPageCount }}
            </span>
            <Button
              type="secondary"
              :disabled="bankPage >= bankPageCount - 1"
              @click="bankPage = Math.min(bankPageCount - 1, bankPage + 1)"
            >
              {{ t`Next` }}
            </Button>
          </div>
        </div>

        <div class="mt-8 border-t dark:border-gray-700 pt-4">
          <BankAccountActivityPanel
            v-if="selectedAccount"
            :key="selectedAccount + ':' + importRefreshKey"
            :account-name="selectedAccount"
            :review-tab="reviewTab"
            @update:review-tab="setReviewTab"
            @import-bank-file="goImportBankFile"
          />
          <p
            v-else-if="!accountsLoading && !feedsLoading"
            class="text-sm text-gray-600 dark:text-gray-300"
          >
            {{ t`Select a bank to review activity.` }}
          </p>
        </div>
      </div>

      <div class="flex h-full shrink-0">
        <Drawer
          :open="sideMode != null"
          :title="sideDrawerTitle"
          @close="closeSideDrawer"
        >
          <ManualBankSetupPanel
            v-if="sideMode === 'add'"
            key="add-bank"
            variant="form"
            :show-archived-list="false"
            :show-add-button="false"
            @created="onManualBankCreated"
            @close="closeSideDrawer"
          />
          <BankStatementImport
            v-else-if="sideMode === 'import' && importDrawerAccount"
            :key="importDrawerAccount"
            :embedded="true"
            :preset-bank-account="importDrawerAccount"
            @imported="onImportDrawerDone"
            @close="closeSideDrawer"
          />
          <PlaidBankConnectionDrawer
            v-else-if="sideMode === 'manageBank' && manageItemId"
            :key="'bank:' + manageItemId"
            :item-id="manageItemId"
            @close="closeSideDrawer"
            @changed="onManageChanged"
            @reconnect="onReconnectFromDrawer"
          />
          <PlaidAccountManageDrawer
            v-else-if="
              sideMode === 'manageAccount' &&
              manageItemId &&
              managePlaidAccountId
            "
            :key="'acc:' + manageItemId + ':' + managePlaidAccountId"
            :item-id="manageItemId"
            :plaid-account-id="managePlaidAccountId"
            @close="closeSideDrawer"
            @changed="onManageChanged"
            @import-file="onAccountImportFromDrawer"
          />
        </Drawer>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import Button from 'src/components/Button.vue';
import PageHeader from 'src/components/PageHeader.vue';
import BankAccountActivityPanel from 'src/components/bankFeed/BankAccountActivityPanel.vue';
import ManualBankSetupPanel from 'src/components/bankFeed/ManualBankSetupPanel.vue';
import PlaidBankConnectionDrawer from 'src/components/bankFeed/PlaidBankConnectionDrawer.vue';
import PlaidAccountManageDrawer from 'src/components/bankFeed/PlaidAccountManageDrawer.vue';
import Drawer from 'src/components/Drawer.vue';
import BankStatementImport from 'src/pages/BankStatementImport.vue';
import { countLedgerRowsForAccount } from 'src/utils/bankAccountSettings';
import { t } from 'fyo';
import { fyo } from 'src/initFyo';
import { showToast } from 'src/utils/interactive';
import {
  LIVEBOOKS_CLOUD_SESSION_APP_REFRESH_EVENT,
  openLivebooksCloudAccountSecurity,
} from 'src/utils/livebooksCloud';
import { ensureLivebooksCloudBookId } from 'src/utils/livebooksCloudBook';
import {
  exchangePlaidPublicTokenWithStepUp,
  requestPlaidLinkTokenWithStepUp,
} from 'src/utils/plaidLinkApi';
import { promptPlaidMfaTotp } from 'src/utils/plaidBankFeedsApi';
import { openPlaidLinkModal } from 'src/utils/plaidLinkClient';
import {
  feedItemById,
  isManualBankAccount,
  isPlaidCreditAccount,
  loadAllBankCoaAccounts,
  loadArchivedBankCoaAccounts,
  loadPlaidAccountMaps,
  manualPendingCountFor,
  type BankCoaAccount,
  type PlaidMapRow,
} from 'src/utils/bankFeedHelpers';
import {
  ackImportBatch,
  fetchImportBatchPayload,
  fetchPendingImportBatches,
  fetchPlaidFeedsWithStepUp,
  reopenAckedPlaidImportBatches,
  type ImportBatchListRow,
  type PlaidFeedItemRow,
} from 'src/utils/plaidBankFeedsApi';
import { refreshFeedsNow } from 'src/utils/plaidBackgroundSync';
import {
  fetchPlaidLinkedAccounts,
  formatPlaidAccountLabel as formatPlaidLinkedRowLabel,
  type PlaidLinkedAccountRow,
} from 'src/utils/plaidLinkedAccountsApi';
import { routeTo } from 'src/utils/ui';
import { isCredit } from 'models/helpers';
import { AccountTypeEnum } from 'models/baseModels/Account/types';
import { ModelNameEnum } from 'models/types';
import { accountDisplayName } from 'utils/accountDisplay';
import { defineComponent } from 'vue';

type TxRow = {
  date?: string;
  amount?: string;
  currency?: string;
  name?: string;
  account_id?: string;
};

type PreviewState = {
  loading: boolean;
  error?: string;
  rows?: TxRow[];
};

type BankTableRow = {
  bankAccountId: string;
  bankAccountName: string;
  bankBalanceLabel: string | null;
  lastSyncLabel: string | null;
  toReviewCount: number;
  ledgerName: string | null;
  ledgerAccountLabel: string | null;
  ledgerBalanceLabel: string | null;
  archived?: boolean;
};

type BankTable = {
  itemId: string;
  bankName: string;
  lastSyncLabel: string | null;
  loginRequired: boolean;
  pendingAtBank: number;
  health: 'ok' | 'stale' | 'broken' | null;
  ingestPaused: boolean;
  rows: BankTableRow[];
  kind: 'plaid' | 'manual';
};

export default defineComponent({
  name: 'BankFeedHub',
  components: {
    PageHeader,
    Button,
    BankAccountActivityPanel,
    ManualBankSetupPanel,
    PlaidBankConnectionDrawer,
    PlaidAccountManageDrawer,
    Drawer,
    BankStatementImport,
  },
  data() {
    return {
      bookId: '' as string,
      plaidAutoStageImportBatches: true as boolean,
      feedsLoading: false,
      feedsError: '' as string,
      feedItems: [] as PlaidFeedItemRow[],
      feedsEtag: undefined as string | undefined,
      plaidLinkBusy: false,
      expandedItemId: null as string | null,
      batchesForExpanded: [] as ImportBatchListRow[],
      batchListLoading: false,
      batchListError: '' as string,
      previewByBatch: {} as Record<string, PreviewState>,
      boundVisibility: null as (() => void) | null,
      boundCloudSessionRefresh: null as (() => void) | null,
      chartBankAccounts: [] as {
        name: string;
        accountName?: string;
        rootType?: string;
        accountType?: string;
      }[],
      manualBankAccounts: [] as BankCoaAccount[],
      archivedManualBankAccounts: [] as BankCoaAccount[],
      showArchived: false,
      toReviewByAccount: {} as Record<string, number>,
      linkedAccountsByItem: {} as Record<string, PlaidLinkedAccountRow[]>,
      linkedAccountsError: {} as Record<string, string>,
      linkedAccountsLoading: {} as Record<string, boolean>,
      linkedAccountsFetched: {} as Record<string, boolean>,
      // Last server-known feed_version per Plaid item; we use this to skip
      // /accounts/get refetches when nothing has changed for a given item.
      lastFeedVersionByItem: {} as Record<string, number>,
      chartSelections: {} as Record<string, string>,
      resolvedChartByPlaid: {} as Record<string, string>,
      plaidMapsFlat: [] as PlaidMapRow[],
      totalsByAccount: {} as Record<
        string,
        { totalDebit: number; totalCredit: number }
      >,
      accountsLoading: false,
      hubTab: 'manual' as 'manual' | 'online',
      selectedAccount: '' as string,
      reviewTab: 'review' as 'review' | 'reviewed' | 'excluded',
      bankPage: 0,
      sideMode: null as null | 'add' | 'import' | 'manageBank' | 'manageAccount',
      importDrawerAccount: '' as string,
      importRefreshKey: 0,
      manageItemId: '' as string,
      managePlaidAccountId: '' as string,
      /** Survives keep-alive sidebar navigations when route has no ?account= / ?tab= */
      persistedSelectedAccount: '' as string,
      persistedHubTab: 'manual' as 'manual' | 'online',
      manualLedgerRowCounts: {} as Record<string, number>,
    };
  },
  computed: {
    feedByItem(): Record<string, PlaidFeedItemRow> {
      return feedItemById(this.feedItems);
    },
    ledgerByName(): Record<
      string,
      { rootType?: string; accountName?: string; accountType?: string }
    > {
      const out: Record<
        string,
        { rootType?: string; accountName?: string; accountType?: string }
      > = {};
      for (const a of this.chartBankAccounts) {
        out[a.name] = {
          rootType: a.rootType,
          accountName: a.accountName,
          accountType: a.accountType,
        };
      }
      for (const a of this.manualBankAccounts) {
        out[a.name] = {
          rootType: a.rootType,
          accountName: a.accountName,
          accountType: a.accountType,
        };
      }
      for (const a of this.archivedManualBankAccounts) {
        out[a.name] = {
          rootType: a.rootType,
          accountName: a.accountName,
          accountType: a.accountType,
        };
      }
      return out;
    },
    bankTables(): BankTable[] {
      const tables: BankTable[] = [];
      for (const it of this.feedItems) {
        const bankName =
          (it.institution_name && it.institution_name.trim()) || it.item_id;
        const lastSyncLabel = this.formatLocalTimestamp(it.last_sync_at);
        const linked = this.linkedAccountsByItem[it.item_id] ?? [];
        const rows: BankTableRow[] = linked.map((acc) => {
          const bankBalanceLabel = this.formatBankBalance(acc);
          const ledgerName = this.ledgerNameForPlaidAccount(
            it.item_id,
            acc.account_id
          );
          const toReviewCount = ledgerName
            ? this.toReviewByAccount[ledgerName] ?? 0
            : 0;
          const ledgerRootType = ledgerName ? this.ledgerByName[ledgerName]?.rootType : undefined;
          const ledgerBalanceLabel = ledgerName
            ? this.balanceFor(ledgerName, ledgerRootType)
            : null;
          return {
            bankAccountId: acc.account_id,
            bankAccountName: formatPlaidLinkedRowLabel(acc),
            bankBalanceLabel,
            lastSyncLabel,
            toReviewCount,
            ledgerName,
            ledgerAccountLabel: ledgerName
              ? accountDisplayName({
                name: ledgerName,
                accountName: this.ledgerByName[ledgerName]?.accountName,
              })
              : null,
            ledgerBalanceLabel,
          };
        });
        rows.sort((a, b) => a.bankAccountName.localeCompare(b.bankAccountName));
        tables.push({
          itemId: it.item_id,
          bankName,
          lastSyncLabel,
          loginRequired: it.item_login_required === true,
          pendingAtBank: it.last_pending_dropped_count ?? 0,
          health: it.health ?? null,
          ingestPaused: !!it.ingest_paused_at,
          rows,
          kind: 'plaid',
        });
      }
      const manualRows: BankTableRow[] = [];
      for (const acc of this.manualBankAccounts) {
        const ledgerRootType = this.ledgerByName[acc.name]?.rootType;
        manualRows.push({
          bankAccountId: acc.name,
          bankAccountName: accountDisplayName(acc),
          bankBalanceLabel: null,
          lastSyncLabel: null,
          toReviewCount: this.toReviewByAccount[acc.name] ?? 0,
          ledgerName: acc.name,
          ledgerAccountLabel: accountDisplayName(acc),
          ledgerBalanceLabel: this.balanceFor(acc.name, ledgerRootType),
          archived: false,
        });
      }
      if (this.showArchived) {
        for (const acc of this.archivedManualBankAccounts) {
          const ledgerRootType = this.ledgerByName[acc.name]?.rootType;
          manualRows.push({
            bankAccountId: acc.name,
            bankAccountName: accountDisplayName(acc),
            bankBalanceLabel: null,
            lastSyncLabel: null,
            toReviewCount: this.toReviewByAccount[acc.name] ?? 0,
            ledgerName: acc.name,
            ledgerAccountLabel: accountDisplayName(acc),
            ledgerBalanceLabel: this.balanceFor(acc.name, ledgerRootType),
            archived: true,
          });
        }
      }
      manualRows.sort((a, b) => {
        if (!!a.archived !== !!b.archived) {
          return a.archived ? 1 : -1;
        }
        return a.bankAccountName.localeCompare(b.bankAccountName);
      });
      if (manualRows.length > 0) {
        tables.push({
          itemId: 'manual',
          bankName: t`Manual Banks`,
          lastSyncLabel: null,
          loginRequired: false,
          pendingAtBank: 0,
          health: null,
          ingestPaused: false,
          rows: manualRows,
          kind: 'manual',
        });
      }
      tables.sort((a, b) => {
        if (a.kind !== b.kind) {
          return a.kind === 'plaid' ? -1 : 1;
        }
        return a.bankName.localeCompare(b.bankName);
      });
      return tables;
    },
    visibleBankTables(): BankTable[] {
      const want = this.hubTab === 'online' ? 'plaid' : 'manual';
      return this.bankTables.filter((t) => t.kind === want);
    },
    hubRowCount(): number {
      return this.visibleBankTables.reduce((n, b) => n + b.rows.length, 0);
    },
    showBankPager(): boolean {
      return this.hubRowCount > 8;
    },
    bankPageCount(): number {
      if (!this.showBankPager) {
        return 1;
      }
      return Math.max(1, Math.ceil(this.hubRowCount / 5));
    },
    pagedBankTables(): BankTable[] {
      if (!this.showBankPager) {
        return this.visibleBankTables;
      }
      const start = this.bankPage * 5;
      const end = start + 5;
      let seen = 0;
      const out: BankTable[] = [];
      for (const bank of this.visibleBankTables) {
        const rows: BankTableRow[] = [];
        for (const row of bank.rows) {
          if (seen >= start && seen < end) {
            rows.push(row);
          }
          seen += 1;
        }
        if (rows.length) {
          out.push({ ...bank, rows });
        }
      }
      return out;
    },
    sideDrawerTitle(): string {
      if (this.sideMode === 'add') {
        return t`Add bank`;
      }
      if (this.sideMode === 'import') {
        return t`Import file`;
      }
      if (this.sideMode === 'manageBank') {
        const row = this.feedItems.find((r) => r.item_id === this.manageItemId);
        const name = row?.institution_name?.trim() || this.manageItemId;
        return name ? t`${name}` : t`Manage bank`;
      }
      if (this.sideMode === 'manageAccount') {
        const bank = this.pagedBankTables.find(
          (b) => b.itemId === this.manageItemId
        );
        const row = bank?.rows.find(
          (r) => r.bankAccountId === this.managePlaidAccountId
        );
        const label =
          row?.bankAccountName || this.managePlaidAccountId || t`Account`;
        return t`${label}`;
      }
      return '';
    },
    autostageTip(): string {
      return t`When on, new online import batches are auto-staged into Bank Account Activity (For Review). Applies to all online banks.`;
    },
  },
  watch: {
    '$route.query': {
      deep: true,
      handler() {
        this.syncHubStateFromRoute();
      },
    },
    hubTab() {
      this.bankPage = 0;
    },
    showArchived() {
      this.bankPage = 0;
    },
    feedItems: {
      handler() {
        void this.prefetchLinkedForAllItems();
      },
      deep: true,
    },
  },
  activated() {
    this.syncHubStateFromRoute();
    this.restorePersistedSelectionIfNeeded();
    void this.loadManualSection();
  },
  deactivated() {
    if (this.selectedAccount) {
      this.persistedSelectedAccount = this.selectedAccount;
    }
    this.persistedHubTab = this.hubTab;
    this.closeSideDrawer();
  },
  mounted() {
    this.syncHubStateFromRoute();
    this.syncPlaidDesktopPreferences();
    void this.bootstrapAccounts();
    void this.bootstrapFeeds();
    this.boundVisibility = () => {
      this.onVisibility();
    };
    document.addEventListener('visibilitychange', this.boundVisibility);
    this.boundCloudSessionRefresh = () => {
      void this.bootstrapAccounts();
      void refreshFeedsNow();
    };
    document.addEventListener(
      LIVEBOOKS_CLOUD_SESSION_APP_REFRESH_EVENT,
      this.boundCloudSessionRefresh
    );
  },
  beforeUnmount() {
    if (this.boundVisibility) {
      document.removeEventListener('visibilitychange', this.boundVisibility);
    }
    if (this.boundCloudSessionRefresh) {
      document.removeEventListener(
        LIVEBOOKS_CLOUD_SESSION_APP_REFRESH_EVENT,
        this.boundCloudSessionRefresh
      );
    }
  },
  methods: {
    t,
    openManualSetup() {
      this.sideMode = 'add';
    },
    closeSideDrawer() {
      this.sideMode = null;
      this.importDrawerAccount = '';
      this.manageItemId = '';
      this.managePlaidAccountId = '';
    },
    syncPlaidDesktopPreferences() {
      this.plaidAutoStageImportBatches = !!fyo.config.get(
        'plaidAutoStageImportBatches',
        true
      );
    },
    togglePlaidAutoStage(ev: Event) {
      const el = ev.target as HTMLInputElement | null;
      const v = !!el?.checked;
      this.plaidAutoStageImportBatches = v;
      fyo.config.set('plaidAutoStageImportBatches', v);
    },
    openBankManageDrawer(itemId: string) {
      this.importDrawerAccount = '';
      this.managePlaidAccountId = '';
      this.manageItemId = itemId;
      this.sideMode = 'manageBank';
    },
    openAccountManageDrawer(itemId: string, plaidAccountId: string) {
      if (!plaidAccountId) {
        return;
      }
      this.importDrawerAccount = '';
      this.manageItemId = itemId;
      this.managePlaidAccountId = plaidAccountId;
      this.sideMode = 'manageAccount';
    },
    onReconnectFromDrawer(itemId: string) {
      void this.linkBankWithPlaid(itemId);
    },
    onAccountImportFromDrawer(accountName: string) {
      this.goImportBankFile(accountName);
    },
    async onManualBanksChanged() {
      await this.bootstrapAccounts();
      await this.refreshManualLedgerCounts();
      if (
        this.selectedAccount &&
        this.archivedManualBankAccounts.some(
          (a) => a.name === this.selectedAccount
        )
      ) {
        this.selectedAccount = '';
        this.persistedSelectedAccount = '';
      }
    },
    async onManualBankCreated(payload: { accountName: string }) {
      this.closeSideDrawer();
      await this.onManualBanksChanged();
      if (payload?.accountName) {
        this.selectAccount(payload.accountName);
      }
    },
    async onManageChanged() {
      await this.bootstrapAccounts();
      await this.refreshFeeds(false);
      await this.prefetchLinkedForAllItems();
    },
    async refreshManualLedgerCounts() {
      const counts: Record<string, number> = {};
      for (const a of this.manualBankAccounts) {
        try {
          counts[a.name] = await countLedgerRowsForAccount(a.name);
        } catch {
          counts[a.name] = 0;
        }
      }
      this.manualLedgerRowCounts = counts;
    },
    manualLifecycleLabel(accountName: string): string {
      const n = this.manualLedgerRowCounts[accountName] ?? 0;
      return n === 0 ? t`Delete` : t`Archive`;
    },
    async archiveOrDeleteManualBank(row: BankTableRow) {
      const panel = this.$refs.manualSetup as
        | { runLifecycleForAccount?: (n: string, d?: string) => Promise<void> }
        | undefined;
      if (panel?.runLifecycleForAccount && row.ledgerName) {
        await panel.runLifecycleForAccount(
          row.ledgerName,
          row.bankAccountName
        );
      }
    },
    setHubTab(tab: 'manual' | 'online') {
      if (this.hubTab === tab && this.$route.query.tab === tab) {
        return;
      }
      // Mode switch clears account selection on purpose.
      this.persistedSelectedAccount = '';
      this.selectedAccount = '';
      this.persistedHubTab = tab;
      this.closeSideDrawer();
      void routeTo({
        path: '/bank-feeds',
        query: { tab, reviewTab: this.reviewTab },
      });
    },
    async bootstrapAccounts() {
      this.accountsLoading = true;
      try {
        this.plaidMapsFlat = await loadPlaidAccountMaps();
        const rows = (await fyo.db.getAll(ModelNameEnum.Account, {
          fields: ['name', 'accountName', 'rootType', 'accountType'],
          filters: {
            accountType: [
              'in',
              [AccountTypeEnum.Bank, AccountTypeEnum.CreditCard],
            ],
            isGroup: false,
            disabled: false,
          },
        })) as {
          name: string;
          accountName?: string;
          rootType?: string;
          accountType?: string;
        }[];
        this.chartBankAccounts = rows;
        const totals = await fyo.db.getTotalCreditAndDebit();
        const map: Record<string, { totalDebit: number; totalCredit: number }> =
          {};
        for (const row of totals) {
          const acc = row.account;
          map[acc] = {
            totalDebit: Number(row.totalDebit ?? 0),
            totalCredit: Number(row.totalCredit ?? 0),
          };
        }
        this.totalsByAccount = map;
        await this.loadManualSection();
        await this.refreshManualLedgerCounts();
      } finally {
        this.accountsLoading = false;
      }
    },
    async loadManualSection() {
      const all = await loadAllBankCoaAccounts();
      const archivedAll = await loadArchivedBankCoaAccounts();
      const manual = all.filter((a) =>
        isManualBankAccount(a.name, this.plaidMapsFlat)
      );
      const archivedManual = archivedAll.filter((a) =>
        isManualBankAccount(a.name, this.plaidMapsFlat)
      );
      this.manualBankAccounts = manual;
      this.archivedManualBankAccounts = archivedManual;
      const counts: Record<string, number> = {};
      for (const a of [...all, ...archivedAll]) {
        try {
          counts[a.name] = await manualPendingCountFor(a.name);
        } catch {
          counts[a.name] = 0;
        }
      }
      this.toReviewByAccount = counts;
    },
    balanceFor(name: string, rootType?: string): string {
      const total = this.totalsByAccount[name];
      if (!total) {
        return fyo.format(0, 'Currency');
      }
      const { totalCredit, totalDebit } = total;
      const rt = rootType as Parameters<typeof isCredit>[0] | undefined;
      let v = totalDebit - totalCredit;
      if (rt && isCredit(rt)) {
        v = totalCredit - totalDebit;
      }
      return fyo.format(v, 'Currency');
    },
    syncHubStateFromRoute() {
      const q = this.$route.query;
      const tab = q.tab;
      if (tab === 'online' || tab === 'manual') {
        this.hubTab = tab;
        this.persistedHubTab = tab;
      } else if (this.persistedHubTab === 'online' || this.persistedHubTab === 'manual') {
        this.hubTab = this.persistedHubTab;
      } else {
        this.hubTab = 'manual';
      }
      const rt = q.reviewTab;
      if (rt === 'review' || rt === 'reviewed' || rt === 'excluded') {
        this.reviewTab = rt;
      }
      const acc = q.account;
      if (typeof acc === 'string' && acc) {
        try {
          this.selectedAccount = decodeURIComponent(acc);
        } catch {
          this.selectedAccount = acc;
        }
        this.persistedSelectedAccount = this.selectedAccount;
      } else {
        this.selectedAccount = '';
      }
    },
    restorePersistedSelectionIfNeeded() {
      const q = this.$route.query;
      const hasAccount = typeof q.account === 'string' && !!q.account;
      const hasTab = q.tab === 'online' || q.tab === 'manual';
      if (hasAccount && hasTab) {
        return;
      }
      const accountName = this.persistedSelectedAccount;
      const tab = hasTab
        ? (q.tab as 'manual' | 'online')
        : this.persistedHubTab || this.hubTab;
      if (!accountName && hasTab) {
        return;
      }
      if (!accountName && !hasTab && tab === 'manual') {
        return;
      }
      void routeTo({
        path: '/bank-feeds',
        query: {
          tab,
          ...(accountName
            ? { account: encodeURIComponent(accountName) }
            : {}),
          reviewTab: this.reviewTab,
        },
      });
    },
    selectAccount(accountName: string) {
      if (this.selectedAccount === accountName) {
        return;
      }
      void routeTo({
        path: '/bank-feeds',
        query: {
          tab: this.hubTab,
          account: encodeURIComponent(accountName),
          reviewTab: this.reviewTab,
        },
      });
    },
    setReviewTab(tab: 'review' | 'reviewed' | 'excluded') {
      if (this.reviewTab === tab) {
        return;
      }
      void routeTo({
        path: '/bank-feeds',
        query: {
          tab: this.hubTab,
          ...(this.selectedAccount
            ? { account: encodeURIComponent(this.selectedAccount) }
            : {}),
          reviewTab: tab,
        },
      });
    },
    goImportBankFile(accountName: string) {
      this.manageItemId = '';
      this.importDrawerAccount = accountName;
      this.sideMode = 'import';
      if (this.selectedAccount !== accountName) {
        void routeTo({
          path: '/bank-feeds',
          query: {
            tab: this.hubTab,
            account: encodeURIComponent(accountName),
            reviewTab: 'review',
          },
        });
      }
    },
    async onImportDrawerDone(payload: { bankAccount: string }) {
      const accountName = payload?.bankAccount || this.importDrawerAccount;
      this.closeSideDrawer();
      this.importRefreshKey += 1;
      await this.loadManualSection();
      void routeTo({
        path: '/bank-feeds',
        query: {
          tab: this.hubTab,
          account: encodeURIComponent(accountName),
          reviewTab: 'review',
        },
      });
    },
    plaidLinkPromptTotp() {
      return promptPlaidMfaTotp(
        t`Enter your LiveBooks Cloud authenticator or backup code to link a bank account.`
      );
    },
    promptPlaidTotp() {
      return promptPlaidMfaTotp(
        t`Enter your LiveBooks Cloud authenticator or backup code to view bank feed status.`
      );
    },
    async linkBankWithPlaid(itemId?: string) {
      if (!this.bookId) {
        showToast({
          type: 'error',
          message: this.msgSignInCloud(),
        });
        return;
      }
      if (this.plaidLinkBusy) {
        return;
      }
      const bookId = this.bookId;
      this.plaidLinkBusy = true;
      try {
        const { linkToken, error: tokenErr, mfaNotConfigured } =
          await requestPlaidLinkTokenWithStepUp(bookId, {
            itemId,
          });
        if (mfaNotConfigured) {
          showToast({
            type: 'warning',
            message: t`Set up two-factor authentication on LiveBooks Cloud before linking a bank.`,
            duration: 'long',
          });
          openLivebooksCloudAccountSecurity();
          return;
        }
        if (tokenErr || !linkToken) {
          showToast({
            type: 'error',
            message: tokenErr ?? t`Could not start Plaid Link.`,
          });
          return;
        }
        const outcome = await openPlaidLinkModal({
          linkToken,
          onSuccess: async (publicToken) => {
            const ex = await exchangePlaidPublicTokenWithStepUp(
              bookId,
              publicToken
            );
            if (ex.mfaNotConfigured) {
              openLivebooksCloudAccountSecurity();
              throw new Error(
                ex.error ??
                t`Set up two-factor authentication on LiveBooks Cloud first.`
              );
            }
            if (!ex.ok) {
              throw new Error(ex.error ?? t`Could not save bank connection.`);
            }
            showToast({
              type: 'success',
              message: t`Bank linked. Accounts will appear below after a short sync.`,
            });
            await this.refreshFeeds(false);
            await this.prefetchLinkedForAllItems();
            await this.bootstrapAccounts();
          },
        });
        if (outcome === 'exit') {
          /* user closed Plaid without finishing */
        }
      } catch (e) {
        showToast({
          type: 'error',
          message: (e as Error).message,
        });
      } finally {
        this.plaidLinkBusy = false;
      }
    },
    msgSignInCloud() {
      return t`Online bank feeds are for when your operations need them. Sign into LiveBooks Cloud to use them here.`;
    },
    msgEmptyPayload() {
      return t`Empty payload`;
    },
    msgAckFailed() {
      return t`Ack failed`;
    },
    msgNotMapped() {
      return t`Not mapped`;
    },
    formatLocalTimestamp(iso: string | null): string | null {
      if (!iso) {
        return null;
      }
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) {
        return iso;
      }
      return new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(d);
    },
    formatBankBalance(acc: PlaidLinkedAccountRow): string | null {
      const b = acc.balances ?? undefined;
      const current =
        b && typeof b === 'object' ? (b).current : undefined;
      const available =
        b && typeof b === 'object'
          ? (b).available
          : undefined;
      const v =
        typeof current === 'number'
          ? current
          : typeof available === 'number'
            ? available
            : null;
      return v == null ? null : fyo.format(v, 'Currency');
    },
    ledgerNameForPlaidAccount(itemId: string, plaidAccountId: string): string | null {
      const k = this.selKey(itemId, plaidAccountId);
      const mapped = this.resolvedChartByPlaid[k];
      if (mapped) {
        return mapped;
      }
      const fallback = this.plaidMapsFlat.find(
        (m) => m.plaidItemId === itemId && m.plaidAccountId === plaidAccountId
      )?.chartAccount;
      return fallback ?? null;
    },
    selKey(itemId: string, plaidAccountId: string) {
      return `${itemId}\x1f${plaidAccountId}`;
    },
    labelForPlaid(acc: PlaidLinkedAccountRow) {
      return formatPlaidLinkedRowLabel(acc);
    },
    chartAccountForTx(tx: TxRow): string {
      if (!this.expandedItemId || !tx.account_id) {
        return '—';
      }
      const k = this.selKey(this.expandedItemId, tx.account_id);
      const chartName = this.resolvedChartByPlaid[k];
      if (!chartName) {
        return this.msgNotMapped();
      }
      const coa = this.ledgerByName[chartName];
      return accountDisplayName({
        name: chartName,
        accountName: coa?.accountName,
      });
    },
    async loadChartBankAccountsForMaps() {
      this.chartBankAccounts = (await fyo.db.getAll(ModelNameEnum.Account, {
        fields: ['name', 'accountName', 'rootType', 'accountType'],
        filters: {
          accountType: [
            'in',
            [AccountTypeEnum.Bank, AccountTypeEnum.CreditCard],
          ],
          isGroup: false,
          disabled: false,
        },
      })) as {
        name: string;
        accountName?: string;
        rootType?: string;
        accountType?: string;
      }[];
    },
    async hydrateMappingsForItem(itemId: string) {
      const maps = (await fyo.db.getAll(ModelNameEnum.PlaidBankAccountMap, {
        filters: { plaidItemId: itemId },
        fields: ['plaidAccountId', 'chartAccount'],
      })) as { plaidAccountId: string; chartAccount: string }[];
      const nextSel = { ...this.chartSelections };
      const nextRes = { ...this.resolvedChartByPlaid };
      for (const m of maps) {
        const k = this.selKey(itemId, m.plaidAccountId);
        nextSel[k] = m.chartAccount;
        nextRes[k] = m.chartAccount;
      }
      this.chartSelections = nextSel;
      this.resolvedChartByPlaid = nextRes;
    },
    async loadLinkedAccountsForItem(itemId: string) {
      if (!this.bookId) {
        return;
      }
      this.linkedAccountsLoading = {
        ...this.linkedAccountsLoading,
        [itemId]: true,
      };
      this.linkedAccountsError = { ...this.linkedAccountsError, [itemId]: '' };
      const { accounts, error } = await fetchPlaidLinkedAccounts(
        this.bookId,
        itemId
      );
      this.linkedAccountsLoading = {
        ...this.linkedAccountsLoading,
        [itemId]: false,
      };
      this.linkedAccountsFetched = {
        ...this.linkedAccountsFetched,
        [itemId]: true,
      };
      if (error) {
        this.linkedAccountsError = {
          ...this.linkedAccountsError,
          [itemId]: error,
        };
        this.linkedAccountsByItem = {
          ...this.linkedAccountsByItem,
          [itemId]: [],
        };
        return;
      }
      this.linkedAccountsByItem = {
        ...this.linkedAccountsByItem,
        [itemId]: accounts,
      };
      await this.hydrateMappingsForItem(itemId);
    },
    async prefetchLinkedForAllItems() {
      // Only fetch /accounts/get for items whose feed_version has changed since
      // we last fetched them (or that have never been fetched). This keeps idle
      // polling cheap once everything is steady-state.
      const targets = this.feedItems.filter((r) => {
        if (r.item_login_required) {
          return false;
        }
        const lastVersion = this.lastFeedVersionByItem[r.item_id];
        const currentVersion = r.feed_version ?? 0;
        if (lastVersion === undefined) {
          return true;
        }
        return lastVersion !== currentVersion;
      });

      const stillKnown = new Set(this.feedItems.map((r) => r.item_id));
      for (const id of Object.keys(this.linkedAccountsByItem)) {
        if (!stillKnown.has(id)) {
          delete this.linkedAccountsByItem[id];
          delete this.linkedAccountsError[id];
          delete this.linkedAccountsLoading[id];
          delete this.linkedAccountsFetched[id];
          delete this.lastFeedVersionByItem[id];
        }
      }

      await Promise.all(
        targets.map(async (r) => {
          await this.loadLinkedAccountsForItem(r.item_id);
          this.lastFeedVersionByItem = {
            ...this.lastFeedVersionByItem,
            [r.item_id]: r.feed_version ?? 0,
          };
        })
      );
    },
    async savePlaidMapping(itemId: string, acc: PlaidLinkedAccountRow) {
      const key = this.selKey(itemId, acc.account_id);
      const chart = this.chartSelections[key];
      if (!chart) {
        showToast({
          type: 'error',
          message: t`Choose a chart of accounts bank account before saving.`,
        });
        return;
      }
      // Plaid credit accounts must map to CreditCard ledger accounts.
      if (
        isPlaidCreditAccount(acc.type, acc.subtype) &&
        this.ledgerByName[chart]?.accountType !== AccountTypeEnum.CreditCard
      ) {
        showToast({
          type: 'error',
          message: t`${this.labelForPlaid(
            acc
          )} is a credit card. Map it to a Credit Card ledger account, not a bank account.`,
          duration: 'long',
        });
        return;
      }
      const conflicting = (await fyo.db.getAll(
        ModelNameEnum.PlaidBankAccountMap,
        {
          filters: { chartAccount: chart },
          fields: ['plaidItemId', 'plaidAccountId', 'plaidDisplayLabel'],
        }
      )) as {
        plaidItemId: string;
        plaidAccountId: string;
        plaidDisplayLabel?: string;
      }[];
      const conflict = conflicting.find(
        (r) =>
          !(r.plaidItemId === itemId && r.plaidAccountId === acc.account_id)
      );
      if (conflict) {
        const ownerLabel =
          conflict.plaidDisplayLabel || conflict.plaidAccountId;
        const chartLabel = accountDisplayName(
          this.ledgerByName[chart]
            ? { name: chart, accountName: this.ledgerByName[chart].accountName }
            : { name: chart }
        );
        showToast({
          type: 'error',
          message: t`"${chartLabel}" is already mapped to Plaid account ${ownerLabel}. Each ledger account can only be linked to one Plaid sub-account.`,
        });
        return;
      }
      const label = formatPlaidLinkedRowLabel(acc);
      const existing = (await fyo.db.getAll(ModelNameEnum.PlaidBankAccountMap, {
        filters: { plaidItemId: itemId, plaidAccountId: acc.account_id },
        fields: ['name'],
        limit: 1,
      })) as { name: string }[];
      try {
        const isNewMap = existing.length === 0;
        if (!isNewMap) {
          const doc = await fyo.doc.getDoc(
            ModelNameEnum.PlaidBankAccountMap,
            existing[0].name
          );
          await doc.set('chartAccount', chart);
          await doc.set('plaidDisplayLabel', label);
          await doc.sync();
        } else {
          const doc = fyo.doc.getNewDoc(ModelNameEnum.PlaidBankAccountMap);
          await doc.set('plaidItemId', itemId);
          await doc.set('plaidAccountId', acc.account_id);
          await doc.set('plaidDisplayLabel', label);
          await doc.set('chartAccount', chart);
          await doc.sync();
        }
        this.resolvedChartByPlaid = {
          ...this.resolvedChartByPlaid,
          [key]: chart,
        };
        this.plaidMapsFlat = await loadPlaidAccountMaps();
        showToast({ type: 'success', message: t`Mapping saved.` });
        if (isNewMap && this.bookId) {
          const reopen = await reopenAckedPlaidImportBatches(
            this.bookId,
            itemId,
            { days: 90, promptTotp: () => promptPlaidMfaTotp() }
          );
          if (reopen.ok) {
            if ((reopen.reopenedCount ?? 0) > 0) {
              showToast({
                type: 'success',
                message: t`Reopened ${String(reopen.reopenedCount)} bank feed batch(es) so history can catch up.`,
                duration: 'long',
              });
              void refreshFeedsNow();
            } else {
              showToast({
                type: 'warning',
                message: t`No stored batches left to re-fetch for this account. Recent history may be incomplete — import a CSV/OFX if you need older transactions.`,
                duration: 'long',
              });
            }
          }
        }
      } catch (e) {
        showToast({
          type: 'error',
          message: (e as Error).message,
        });
      }
    },
    onVisibility() {
      if (!document.hidden) {
        void refreshFeedsNow();
      }
    },
    async bootstrapFeeds() {
      const ctx = await ensureLivebooksCloudBookId(fyo);
      if (!ctx.ok) {
        // Do not surface cloud sign-in here — Manual feeds work offline;
        // Online connect messaging lives on the Online tab.
        this.bookId = '';
        return;
      }
      this.bookId = ctx.bookId;
      await this.loadChartBankAccountsForMaps();
      await this.refreshFeeds(false);
    },
    async refreshFeeds(
      useEtag: boolean
    ): Promise<{ notModified: boolean; fetchFailed: boolean }> {
      if (!this.bookId) {
        return { notModified: false, fetchFailed: false };
      }
      this.feedsLoading = !useEtag;
      this.feedsError = '';
      const res = await fetchPlaidFeedsWithStepUp(this.bookId, {
        ifNoneMatch: useEtag ? this.feedsEtag : undefined,
        promptTotp: useEtag ? null : () => this.promptPlaidTotp(),
      });
      this.feedsLoading = false;
      if (res.error) {
        this.feedsError = res.error;
        return { notModified: false, fetchFailed: true };
      }
      if (res.notModified) {
        return { notModified: true, fetchFailed: false };
      }
      if (res.payload) {
        const items = res.payload.items ?? [];
        this.feedItems = items;
        if (res.etag) {
          this.feedsEtag = res.etag;
        }
        await this.prefetchLinkedForAllItems();
      }
      return { notModified: false, fetchFailed: false };
    },
    async toggleItem(itemId: string) {
      if (this.expandedItemId === itemId) {
        this.expandedItemId = null;
        this.batchesForExpanded = [];
        this.batchListError = '';
        return;
      }
      this.expandedItemId = itemId;
      await this.loadBatchesForItem(itemId);
    },
    async loadBatchesForItem(itemId: string) {
      if (!this.bookId) {
        return;
      }
      this.batchListLoading = true;
      this.batchListError = '';
      const { batches, error } = await fetchPendingImportBatches(
        this.bookId,
        itemId,
        { limit: 20, promptTotp: () => this.promptPlaidTotp() }
      );
      this.batchListLoading = false;
      if (error) {
        this.batchListError = error;
        this.batchesForExpanded = [];
        return;
      }
      this.batchesForExpanded = batches;
      this.previewByBatch = {};
    },
    previewFor(publicId: string): PreviewState | undefined {
      return this.previewByBatch[publicId];
    },
    async loadPayload(publicId: string) {
      if (!this.bookId) {
        return;
      }
      this.previewByBatch = {
        ...this.previewByBatch,
        [publicId]: { loading: true },
      };
      const { payload, error } = await fetchImportBatchPayload(
        this.bookId,
        publicId,
        { promptTotp: () => this.promptPlaidTotp() }
      );
      if (error || !payload || typeof payload !== 'object') {
        this.previewByBatch = {
          ...this.previewByBatch,
          [publicId]: { loading: false, error: error ?? this.msgEmptyPayload() },
        };
        return;
      }
      const txs = (payload as { transactions?: unknown }).transactions;
      const rows: TxRow[] = [];
      if (Array.isArray(txs)) {
        for (const r of txs) {
          if (!r || typeof r !== 'object') {
            continue;
          }
          const o = r as Record<string, unknown>;
          if (o.removed === true) {
            continue;
          }
          rows.push({
            date: typeof o.date === 'string' ? o.date : undefined,
            amount: typeof o.amount === 'string' ? o.amount : String(o.amount ?? ''),
            currency: typeof o.currency === 'string' ? o.currency : undefined,
            name: typeof o.name === 'string' ? o.name : String(o.name ?? ''),
            account_id:
              typeof o.account_id === 'string' ? o.account_id : undefined,
          });
        }
      }
      this.previewByBatch = {
        ...this.previewByBatch,
        [publicId]: { loading: false, rows },
      };
    },
    async ackBatch(publicId: string) {
      if (!this.bookId) {
        return;
      }
      const { ok, error } = await ackImportBatch(this.bookId, publicId);
      if (!ok) {
        this.feedsError = error ?? this.msgAckFailed();
        return;
      }
      if (this.expandedItemId) {
        await this.loadBatchesForItem(this.expandedItemId);
      }
      await this.refreshFeeds(false);
      const next = { ...this.previewByBatch };
      delete next[publicId];
      this.previewByBatch = next;
    },
  },
});
</script>
