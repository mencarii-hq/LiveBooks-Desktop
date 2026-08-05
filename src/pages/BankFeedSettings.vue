<template>
  <div class="flex flex-col overflow-y-hidden h-full">
    <PageHeader :title="t`Bank Feed Settings`" />

    <div
      class="
        flex-1
        overflow-y-auto overflow-x-hidden
        custom-scroll custom-scroll-thumb1
        p-4
      "
    >
      <div class="flex flex-wrap items-center justify-between gap-2 mb-4">
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
            class="px-4 py-2 text-sm"
            :class="
              settingsTab === 'manual'
                ? 'bg-gray-200 dark:bg-gray-700 font-medium'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-100'
            "
            @click="setSettingsTab('manual')"
          >
            {{ t`Manual` }}
          </button>
          <button
            type="button"
            class="px-4 py-2 text-sm border-s dark:border-gray-700"
            :class="
              settingsTab === 'online'
                ? 'bg-gray-200 dark:bg-gray-700 font-medium'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-100'
            "
            @click="setSettingsTab('online')"
          >
            {{ t`Online` }}
          </button>
        </div>
        <Button
          v-if="settingsTab === 'manual' && !manualPanelOpen"
          type="primary"
          @click="openManualPanel"
        >
          {{ t`Add bank` }}
        </Button>
        <Button
          v-else-if="settingsTab === 'online'"
          type="primary"
          :disabled="plaidLinkBusy || !bookId"
          @click="linkBankWithPlaid()"
        >
          {{ t`Connect Banks via Plaid` }}
        </Button>
      </div>

      <template v-if="settingsTab === 'online'">
        <div
          v-if="bookError"
          class="text-sm text-red-600 dark:text-red-400 mb-4 max-w-5xl"
        >
          <template v-if="bookNeedsCloudSignIn">
            {{ t`Sign into` }}
            <button
              type="button"
              class="
                underline
                font-bold
                text-green-700
                dark:text-green-500
                hover:text-green-800
                dark:hover:text-green-400
              "
              @click="openCloudSignIn"
            >
              {{ t`LiveBooks Cloud` }}
            </button>
            {{ t`to use online bank feeds here.` }}
          </template>
          <template v-else>
            {{ bookError }}
          </template>
        </div>
        <div v-else class="mb-4 max-w-5xl space-y-2">
          <p class="text-sm text-gray-600 dark:text-gray-300">
            {{
              t`Connect a bank via Plaid, then map each bank account to one ledger account. A ledger account can only be linked once.`
            }}
          </p>
          <ul
            class="
              text-sm text-gray-600
              dark:text-gray-300
              list-disc
              ps-5
              space-y-1
            "
          >
            <li>
              {{
                t`Disconnect Feed pauses imports (mapping stays); use Reactivate feed to resume.`
              }}
            </li>
            <li>
              {{
                t`Reconnect bank when Plaid needs you to sign in again for that institution.`
              }}
            </li>
            <li>
              {{
                t`Your ledger lives in this company file — keep one canonical copy if you use Cloud on more than one computer.`
              }}
            </li>
          </ul>
        </div>

        <div
          v-if="bookId"
          class="
            mb-4
            max-w-5xl
            rounded-lg
            border border-gray-200
            dark:border-gray-700
            p-3
            text-sm
          "
        >
          <label class="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              class="mt-1 rounded border-gray-400 dark:border-gray-600"
              :checked="plaidAutoStageImportBatches"
              @change="togglePlaidAutoStage"
            />
            <span class="text-gray-700 dark:text-gray-100">
              <span class="block">
                {{
                  t`Auto-stage new Plaid batches into Bank Account Activity (For Review).`
                }}
              </span>
              <span class="block mt-1 text-gray-600 dark:text-gray-300">
                {{
                  t`Off: open each account and use Pull bank feed. Categories never post automatically.`
                }}
              </span>
            </span>
          </label>
        </div>

        <div
          v-if="feedsLoading"
          class="text-sm text-gray-600 dark:text-gray-300"
        >
          {{ t`Loading feeds…` }}
        </div>
        <div
          v-else-if="feedsError"
          class="text-sm text-red-600 dark:text-red-400"
        >
          {{ feedsError }}
        </div>
        <div
          v-else-if="!bookError && feedItems.length === 0"
          class="text-sm text-gray-600 dark:text-gray-300 mb-6"
        >
          {{
            t`No Plaid connections yet. Use Connect Banks via Plaid to link an institution.`
          }}
        </div>
        <div v-else class="space-y-6">
          <div
            v-for="row in feedItems"
            :key="row.item_id"
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
                class="
                  text-start
                  px-3
                  py-2.5
                  text-sm
                  font-semibold
                  text-gray-900
                  dark:text-gray-100
                  bg-gray-50
                  dark:bg-gray-800
                  border-b border-gray-200
                  dark:border-gray-700
                "
              >
                <div class="flex flex-wrap items-start justify-between gap-2">
                  <div class="min-w-0 flex-1">
                    {{ row.institution_name || row.item_id }}
                    <span
                      v-if="row.health"
                      class="
                        inline-block
                        w-2
                        h-2
                        rounded-full
                        ms-2
                        align-middle
                      "
                      :class="{
                        'bg-emerald-500': row.health === 'ok',
                        'bg-amber-500': row.health === 'stale',
                        'bg-red-500': row.health === 'broken',
                      }"
                      :title="
                        row.health === 'ok'
                          ? t`Connection healthy`
                          : row.health === 'stale'
                          ? t`No recent sync from your bank.`
                          : t`Connection broken — sign in again.`
                      "
                    />
                    <span
                      class="
                        block
                        text-xs
                        font-normal
                        text-gray-600
                        dark:text-gray-300
                        mt-1
                      "
                    >
                      {{ t`Last sync` }}:
                      {{
                        formatLocalTimestamp(row.last_sync_at) ||
                        row.last_sync_at ||
                        t`—`
                      }}
                      · {{ t`Feed version` }}: {{ row.feed_version }}
                    </span>
                    <span
                      v-if="row.ingest_paused_at"
                      class="
                        block
                        text-xs
                        font-normal
                        text-amber-700
                        dark:text-amber-300
                        mt-1
                      "
                    >
                      {{
                        t`Bank feeds paused — acknowledge old import batches in Desktop to resume.`
                      }}
                    </span>
                  </div>
                  <Button
                    type="secondary"
                    class="shrink-0 !text-xs self-start"
                    :disabled="!bookId || refreshItemBusy[row.item_id]"
                    @click.stop="refreshPlaidInstitution(row.item_id)"
                  >
                    {{
                      refreshItemBusy[row.item_id] ? t`Refreshing…` : t`Refresh`
                    }}
                  </Button>
                </div>
              </caption>
              <thead class="bg-gray-50 dark:bg-gray-800 text-xs uppercase">
                <tr>
                  <th class="text-start p-3 border-b dark:border-gray-700">
                    {{ t`Bank account name` }}
                  </th>
                  <th class="text-start p-3 border-b dark:border-gray-700">
                    {{ t`Ledger name` }}
                  </th>
                  <th class="text-start p-3 border-b dark:border-gray-700">
                    {{ t`Actions` }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr class="bg-gray-50/80 dark:bg-gray-900/40">
                  <td
                    colspan="3"
                    class="
                      p-3
                      border-b
                      dark:border-gray-700
                      align-top
                      text-xs text-gray-700
                      dark:text-gray-300
                    "
                  >
                    <div
                      class="
                        flex flex-col
                        lg:flex-row lg:items-start lg:justify-between
                        gap-3
                      "
                    >
                      <p class="max-w-3xl">
                        {{
                          t`Deleted imported lines by mistake? Re-queue batches LiveBooks Cloud still has (typically within 90 days). This replays saved imports — it does not fetch brand-new bank history from Plaid or undo journals you posted. Then open Bank Account Activity for each mapped ledger account.`
                        }}
                      </p>
                      <Button
                        type="secondary"
                        class="shrink-0 !text-xs self-start"
                        :disabled="!bookId || reopenImportBusy[row.item_id]"
                        @click.stop="confirmReopenImportBatches(row)"
                      >
                        {{
                          reopenImportBusy[row.item_id]
                            ? t`Re-fetching…`
                            : t`Re-fetch missing data`
                        }}
                      </Button>
                    </div>
                  </td>
                </tr>
                <tr v-if="row.item_login_required">
                  <td
                    class="p-3 text-sm text-amber-800 dark:text-amber-200"
                    colspan="7"
                  >
                    <div class="flex flex-wrap items-center gap-2">
                      <span>
                        {{
                          t`This connection needs re-authentication with Plaid (login required).`
                        }}
                      </span>
                      <Button
                        type="secondary"
                        :disabled="plaidLinkBusy || !bookId"
                        @click.stop="linkBankWithPlaid(row.item_id)"
                      >
                        {{ t`Reconnect bank` }}
                      </Button>
                    </div>
                  </td>
                </tr>
                <tr v-else-if="linkedAccountsLoading[row.item_id]">
                  <td
                    class="p-3 text-sm text-gray-600 dark:text-gray-300"
                    colspan="7"
                  >
                    {{ t`Loading Plaid accounts…` }}
                  </td>
                </tr>
                <tr v-else-if="linkedAccountsError[row.item_id]">
                  <td class="p-3 text-sm text-red-600" colspan="7">
                    {{ linkedAccountsError[row.item_id] }}
                  </td>
                </tr>
                <tr
                  v-else-if="
                    linkedAccountsFetched[row.item_id] &&
                    !linkedAccountsByItem[row.item_id]?.length
                  "
                >
                  <td
                    class="p-3 text-sm text-gray-600 dark:text-gray-300"
                    colspan="7"
                  >
                    {{
                      t`No Plaid accounts were returned. Use Refresh for this institution or reconnect the bank if login is required.`
                    }}
                  </td>
                </tr>
                <template v-else>
                  <tr
                    v-for="acc in linkedAccountsByItem[row.item_id] || []"
                    :key="acc.account_id"
                    class="
                      border-b
                      dark:border-gray-800
                      last:border-0
                      hover:bg-gray-50
                      dark:hover:bg-gray-800/80
                    "
                    :class="{
                      'cursor-pointer':
                        !!plaidRowLedgerName(row, acc) &&
                        !isPlaidAccountFeedDisconnected(row, acc),
                      'opacity-80': isPlaidAccountFeedDisconnected(row, acc),
                    }"
                    @click="
                    plaidRowLedgerName(row, acc) &&
                    !isPlaidAccountFeedDisconnected(row, acc)
                      ? openManualActivity(plaidRowLedgerName(row, acc)!)
                      : undefined
                  "
                  >
                    <td class="p-3 text-start font-medium">
                      <span>{{ labelForPlaid(acc) }}</span>
                      <span
                        v-if="isPlaidAccountFeedDisconnected(row, acc)"
                        class="
                          block
                          text-xs
                          font-normal
                          text-amber-800
                          dark:text-amber-200
                          mt-0.5
                        "
                      >
                        {{ t`Feed paused — reactivate to import again` }}
                      </span>
                    </td>
                    <td class="p-3 text-start" @click.stop>
                      <div class="flex flex-col gap-1 max-w-xs">
                        <FormControl
                          :border="true"
                          size="small"
                          :show-label="false"
                          :df="chartMappingField(row.item_id, acc.account_id)"
                          :value="
                            chartSelections[
                              selKey(row.item_id, acc.account_id)
                            ] || ''
                          "
                          :read-only="isPlaidAccountFeedDisconnected(row, acc)"
                          @change="
                          (v) =>
                            onChartSelectionChange(
                              row.item_id,
                              acc.account_id,
                              v as string | null
                            )
                        "
                        />
                      </div>
                    </td>
                    <td class="p-3 text-start" @click.stop>
                      <div class="flex flex-wrap items-center gap-2">
                        <Button
                          type="secondary"
                          class="!px-2 !py-1 text-xs"
                          :disabled="isPlaidAccountFeedDisconnected(row, acc)"
                          @click="savePlaidMapping(row.item_id, acc)"
                        >
                          {{ t`Save Mapping` }}
                        </Button>
                        <Button
                          v-if="!isPlaidAccountFeedDisconnected(row, acc)"
                          type="secondary"
                          class="!px-2 !py-1 text-xs"
                          :disabled="!bookId"
                          @click="confirmDisconnectPlaid(row, acc)"
                        >
                          {{ t`Disconnect Feed` }}
                        </Button>
                        <Button
                          v-if="isPlaidAccountFeedDisconnected(row, acc)"
                          type="secondary"
                          class="!px-2 !py-1 text-xs"
                          :disabled="
                            !bookId ||
                            reactivateFeedBusy[
                              selKey(row.item_id, acc.account_id)
                            ]
                          "
                          @click="reactivatePlaidAccountFeed(row, acc)"
                        >
                          {{ t`Reactivate feed` }}
                        </Button>
                        <DropdownWithActions
                          v-if="plaidRowLedgerName(row, acc)"
                          :actions="plaidAccountLifecycleActions(row, acc)"
                        />
                      </div>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </div>
      </template>

      <template v-if="settingsTab === 'manual'">
        <p class="text-sm text-gray-600 dark:text-gray-300 mb-4 max-w-5xl">
          {{
            t`Track accounts you update by importing CSV statements. Use this for any bank or credit card you do not connect with Plaid.`
          }}
        </p>

        <div
          v-if="manualPanelOpen"
          class="
            border border-gray-200
            dark:border-gray-700
            rounded-lg
            p-4
            bg-white
            dark:bg-gray-900
            mb-4
          "
          @keydown.esc="closeManualPanel"
        >
          <h3 class="text-sm font-medium mb-3 dark:text-gray-100">
            {{ t`New manual bank` }}
          </h3>
          <div class="space-y-3 max-w-md">
            <div>
              <label class="block text-sm font-medium mb-1 dark:text-gray-100">
                {{ t`Type` }}
              </label>
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
                  class="px-3 py-1 text-sm"
                  :class="
                    manualForm.kind === 'bank'
                      ? 'bg-gray-200 dark:bg-gray-700 font-medium'
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-100'
                  "
                  @click="manualForm.kind = 'bank'"
                >
                  {{ t`Bank` }}
                </button>
                <button
                  type="button"
                  class="px-3 py-1 text-sm border-s dark:border-gray-700"
                  :class="
                    manualForm.kind === 'credit_card'
                      ? 'bg-gray-200 dark:bg-gray-700 font-medium'
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-100'
                  "
                  @click="manualForm.kind = 'credit_card'"
                >
                  {{ t`Credit card` }}
                </button>
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium mb-1 dark:text-gray-100">
                {{ t`Account name` }}
              </label>
              <input
                ref="manualNameInput"
                v-model="manualForm.accountName"
                type="text"
                class="
                  border
                  rounded
                  px-2
                  py-1
                  w-full
                  dark:bg-gray-800 dark:border-gray-600
                "
                :placeholder="t`e.g. Chase CSV — Checking`"
                @keydown.enter="trySaveManual"
                @input="manualNameError = ''"
              />
              <p v-if="manualNameError" class="mt-1 text-xs text-red-600">
                {{ manualNameError }}
              </p>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label
                  class="block text-sm font-medium mb-1 dark:text-gray-100"
                >
                  {{ t`Opening balance` }}
                </label>
                <input
                  v-model="manualForm.openingBalance"
                  type="text"
                  inputmode="decimal"
                  class="
                    border
                    rounded
                    px-2
                    py-1
                    w-full
                    dark:bg-gray-800 dark:border-gray-600
                  "
                  :placeholder="t`0.00`"
                  @keydown.enter="trySaveManual"
                />
              </div>
              <div>
                <label
                  class="block text-sm font-medium mb-1 dark:text-gray-100"
                >
                  {{ t`As of` }}
                </label>
                <input
                  v-model="manualForm.openingDate"
                  type="date"
                  class="
                    border
                    rounded
                    px-2
                    py-1
                    w-full
                    dark:bg-gray-800 dark:border-gray-600
                  "
                  @keydown.enter="trySaveManual"
                />
              </div>
            </div>
            <p
              v-if="manualNegativeHint"
              class="text-xs text-amber-700 dark:text-amber-300"
            >
              {{ t`This account will start with a negative balance.` }}
            </p>
            <div class="flex justify-end gap-2 pt-2">
              <Button
                type="secondary"
                :disabled="manualSaving"
                @click="closeManualPanel"
              >
                {{ t`Cancel` }}
              </Button>
              <Button
                type="primary"
                :disabled="manualSaving"
                @click="trySaveManual"
              >
                {{ manualSaving ? t`Saving…` : t`Save` }}
              </Button>
            </div>
          </div>
        </div>

        <div
          v-if="manualLoading"
          class="text-sm text-gray-600 dark:text-gray-300"
        >
          {{ t`Loading manual banks…` }}
        </div>
        <div
          v-else-if="manualBanks.length === 0"
          class="text-sm text-gray-600 dark:text-gray-300"
        >
          {{
            t`No manual banks yet. Add one to start importing CSV statements.`
          }}
        </div>
        <div
          v-else
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
            <thead class="bg-gray-50 dark:bg-gray-800 text-xs uppercase">
              <tr>
                <th class="text-start p-3 border-b dark:border-gray-700">
                  {{ t`Account Name` }}
                </th>
                <th class="text-start p-3 border-b dark:border-gray-700">
                  {{ t`Status` }}
                </th>
                <th class="text-start p-3 border-b dark:border-gray-700">
                  {{ t`Actions` }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="m in manualBanks"
                :key="m.name"
                class="
                  cursor-pointer
                  hover:bg-gray-50
                  dark:hover:bg-gray-800/80
                  border-b
                  dark:border-gray-800
                  last:border-0
                "
                @click="openManualActivity(m.name)"
              >
                <td
                  class="p-3 text-start font-medium"
                  :class="m.archived ? 'text-gray-500 dark:text-gray-400' : ''"
                >
                  {{ manualBankLabel(m) }}
                </td>
                <td
                  class="p-3 text-start"
                  :class="m.archived ? 'text-gray-500 dark:text-gray-400' : ''"
                >
                  {{ m.archived ? t`Archived` : t`Active` }}
                </td>

                <td class="p-3 text-start" @click.stop>
                  <Button
                    type="secondary"
                    @click="
                      runManualBankLifecycleAction(
                        m.name,
                        m.archived,
                        manualBankLabel(m)
                      )
                    "
                  >
                    {{
                      m.archived
                        ? t`Restore`
                        : (manualLedgerRowCounts[m.name] ?? 0) === 0
                        ? t`Delete`
                        : t`Archive`
                    }}
                  </Button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>
  </div>
</template>

<script lang="ts">
import Button from 'src/components/Button.vue';
import FormControl from 'src/components/Controls/FormControl.vue';
import DropdownWithActions from 'src/components/DropdownWithActions.vue';
import PageHeader from 'src/components/PageHeader.vue';
import type { Action } from 'fyo/model/types';
import { t } from 'fyo';
import { Field } from 'schemas/types';
import { fyo } from 'src/initFyo';
import { showDialog, showToast } from 'src/utils/interactive';
import {
  openLivebooksCloudAccountSecurity,
  openLivebooksCloudSignIn,
} from 'src/utils/livebooksCloud';
import { ensureLivebooksCloudBookId } from 'src/utils/livebooksCloudBook';
import {
  exchangePlaidPublicTokenWithStepUp,
  requestPlaidLinkTokenWithStepUp,
} from 'src/utils/plaidLinkApi';
import { openPlaidLinkModal } from 'src/utils/plaidLinkClient';
import {
  isManualBankAccount,
  loadAllBankCoaAccounts,
  loadArchivedBankCoaAccounts,
  loadPlaidAccountMaps,
  manualPendingCountFor,
  type BankCoaAccount,
  type PlaidMapRow,
} from 'src/utils/bankFeedHelpers';
import {
  enablePlaidAccountFeed,
  fetchPlaidFeedsWithStepUp,
  promptPlaidMfaTotp,
  reopenAckedPlaidImportBatches,
  type PlaidFeedItemRow,
} from 'src/utils/plaidBankFeedsApi';
import { refreshFeedsNow } from 'src/utils/plaidBackgroundSync';
import {
  fetchPlaidLinkedAccounts,
  formatPlaidAccountLabel as formatPlaidLinkedRowLabel,
  type PlaidLinkedAccountRow,
} from 'src/utils/plaidLinkedAccountsApi';
import { routeTo } from 'src/utils/ui';
import {
  archiveBankAccount,
  countLedgerRowsForAccount,
  deleteEmptyBankAccount,
  disconnectPlaidAccountFeedLocalAndRemote,
  ledgerSignedBalanceForAccount,
  unarchiveBankAccount,
} from 'src/utils/bankAccountSettings';
import { AccountTypeEnum } from 'models/baseModels/Account/types';
import { ModelNameEnum } from 'models/types';
import { isCredit } from 'models/helpers';
import { accountDisplayName } from 'utils/accountDisplay';
import { createManualBankAccount } from 'src/utils/manualBankAccountCreate';
import { defineComponent, nextTick } from 'vue';

function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export default defineComponent({
  name: 'BankFeedSettings',
  components: { PageHeader, Button, DropdownWithActions, FormControl },
  data() {
    return {
      bookId: '' as string,
      bookError: '' as string,
      bookNeedsCloudSignIn: false,
      settingsTab: 'manual' as 'manual' | 'online',
      refreshItemBusy: {} as Record<string, boolean>,
      reopenImportBusy: {} as Record<string, boolean>,
      plaidAutoStageImportBatches: true,
      plaidLinkBusy: false,
      feedsLoading: false,
      feedsError: '' as string,
      feedItems: [] as PlaidFeedItemRow[],
      feedsEtag: undefined as string | undefined,
      chartBankAccounts: [] as {
        name: string;
        accountName?: string;
        rootType?: string;
      }[],
      totalsByAccount: {} as Record<
        string,
        { totalDebit: number; totalCredit: number }
      >,
      linkedAccountsByItem: {} as Record<string, PlaidLinkedAccountRow[]>,
      linkedAccountsError: {} as Record<string, string>,
      linkedAccountsLoading: {} as Record<string, boolean>,
      linkedAccountsFetched: {} as Record<string, boolean>,
      chartSelections: {} as Record<string, string>,
      resolvedChartByPlaid: {} as Record<string, string>,
      manualPanelOpen: false,
      manualSaving: false,
      manualNameError: '' as string,
      manualLoading: false,
      manualBankCoaAccounts: [] as BankCoaAccount[],
      manualPlaidMaps: [] as PlaidMapRow[],
      manualToReviewCounts: {} as Record<string, number>,
      manualLedgerRowCounts: {} as Record<string, number>,
      plaidLedgerRowCounts: {} as Record<string, number>,
      reactivateFeedBusy: {} as Record<string, boolean>,
      manualForm: {
        kind: 'bank' as 'bank' | 'credit_card',
        accountName: '',
        openingBalance: '0',
        openingDate: todayIsoDate(),
      },
    };
  },
  computed: {
    manualBanks(): {
      name: string;
      accountName?: string;
      rootType?: string;
      toReviewCount: number;
      archived: boolean;
    }[] {
      const out: {
        name: string;
        accountName?: string;
        rootType?: string;
        toReviewCount: number;
        archived: boolean;
      }[] = [];
      for (const a of this.manualBankCoaAccounts) {
        if (!isManualBankAccount(a.name, this.manualPlaidMaps)) {
          continue;
        }
        out.push({
          name: a.name,
          accountName: a.accountName,
          rootType: a.rootType,
          toReviewCount: this.manualToReviewCounts[a.name] ?? 0,
          archived: a.disabled === true,
        });
      }
      out.sort((x, y) => {
        if (x.archived !== y.archived) {
          return x.archived ? 1 : -1;
        }
        return accountDisplayName(x).localeCompare(accountDisplayName(y));
      });
      return out;
    },
    manualBalanceFloat(): number | null {
      const raw = this.manualForm.openingBalance.trim().replace(/,/g, '');
      if (raw === '') {
        return 0;
      }
      const n = Number.parseFloat(raw);
      return Number.isFinite(n) ? n : null;
    },
    manualNegativeHint(): boolean {
      return (
        this.manualForm.kind === 'bank' &&
        (this.manualBalanceFloat ?? 0) < 0
      );
    },
    canSaveManual(): boolean {
      const name = this.manualForm.accountName.trim();
      return (
        !!name &&
        !!this.manualForm.openingDate &&
        this.manualBalanceFloat !== null &&
        !this.manualNameError
      );
    },
  },
  watch: {
    '$route.query.tab'() {
      this.syncSettingsTabFromRoute();
    },
  },
  mounted() {
    this.syncSettingsTabFromRoute();
    this.syncPlaidDesktopPreferences();
    void this.bootstrap();
  },
  methods: {
    syncSettingsTabFromRoute() {
      const tab = this.$route.query.tab;
      if (tab === 'online' || tab === 'manual') {
        this.settingsTab = tab;
      } else {
        this.settingsTab = 'manual';
      }
    },
    setSettingsTab(tab: 'manual' | 'online') {
      if (this.settingsTab === tab && this.$route.query.tab === tab) {
        return;
      }
      void routeTo({ path: '/bank-feeds/settings', query: { tab } });
    },
    openCloudSignIn() {
      void openLivebooksCloudSignIn();
    },
    plaidMfaPromptTotp() {
      return promptPlaidMfaTotp(
        t`Enter your LiveBooks Cloud authenticator or backup code to continue.`
      );
    },
    plaidLinkPromptTotp() {
      return promptPlaidMfaTotp(
        t`Enter your LiveBooks Cloud authenticator or backup code to link a bank account.`
      );
    },
    manualBankLabel(m: { name: string; accountName?: string }) {
      return accountDisplayName(m);
    },
    t,
    syncPlaidDesktopPreferences() {
      this.plaidAutoStageImportBatches =
        fyo.config.get('plaidAutoStageImportBatches', true) !== false;
    },
    togglePlaidAutoStage(ev: Event) {
      const input = ev.target as HTMLInputElement | null;
      if (!input) {
        return;
      }
      const v = !!input.checked;
      this.plaidAutoStageImportBatches = v;
      void fyo.config.set('plaidAutoStageImportBatches', v);
    },
    async bootstrap() {
      const ctx = await ensureLivebooksCloudBookId(fyo);
      if (!ctx.ok) {
        this.bookId = '';
        this.bookNeedsCloudSignIn = ctx.reason === 'not_signed_in';
        this.bookError =
          ctx.reason === 'not_signed_in'
            ? t`Sign into LiveBooks Cloud to use online bank feeds here.`
            : (ctx.message ?? t`Could not resolve your cloud book for this company file.`);
        await this.loadChartBankAccountsForMaps();
        await this.loadManualSection();
        return;
      }
      this.bookError = '';
      this.bookNeedsCloudSignIn = false;
      this.bookId = ctx.bookId;
      await this.loadChartBankAccountsForMaps();
      await this.refreshFeeds(false);
      await this.loadManualSection();
    },
    async loadChartBankAccountsForMaps() {
      this.chartBankAccounts = (await fyo.db.getAll(ModelNameEnum.Account, {
        fields: ['name', 'accountName', 'rootType'],
        filters: {
          accountType: AccountTypeEnum.Bank,
          isGroup: false,
          disabled: false,
        },
      })) as {
        name: string;
        accountName?: string;
        rootType?: string;
      }[];
    },
    async loadTotalsByAccount() {
      try {
        const totals = await fyo.db.getTotalCreditAndDebit();
        const map: Record<
          string,
          { totalDebit: number; totalCredit: number }
        > = {};
        for (const row of totals) {
          map[row.account] = {
            totalDebit: Number(row.totalDebit ?? 0),
            totalCredit: Number(row.totalCredit ?? 0),
          };
        }
        this.totalsByAccount = map;
      } catch {
        this.totalsByAccount = {};
      }
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
    ledgerBalanceLabelForName(
      ledgerName: string | null | undefined,
      rootType?: string
    ): string {
      if (!ledgerName) {
        return t`—`;
      }
      const rt =
        rootType ??
        this.chartBankAccounts.find((c) => c.name === ledgerName)?.rootType;
      return this.balanceFor(ledgerName, rt);
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
        b && typeof b === 'object' ? (b ).current : undefined;
      const available =
        b && typeof b === 'object'
          ? (b ).available
          : undefined;
      const v =
        typeof current === 'number'
          ? current
          : typeof available === 'number'
            ? available
            : null;
      return v == null ? null : fyo.format(v, 'Currency');
    },
    ledgerNameForPlaidAccount(
      itemId: string,
      plaidAccountId: string
    ): string | null {
      const k = this.selKey(itemId, plaidAccountId);
      const mapped =
        this.chartSelections[k] || this.resolvedChartByPlaid[k];
      if (mapped) {
        return mapped;
      }
      const fallback = this.manualPlaidMaps.find(
        (m) => m.plaidItemId === itemId && m.plaidAccountId === plaidAccountId
      )?.chartAccount;
      return fallback ?? null;
    },
    plaidRowLedgerName(
      row: PlaidFeedItemRow,
      acc: PlaidLinkedAccountRow
    ): string | null {
      return this.ledgerNameForPlaidAccount(row.item_id, acc.account_id);
    },
    plaidRowToReview(row: PlaidFeedItemRow, acc: PlaidLinkedAccountRow): number {
      const ledger = this.plaidRowLedgerName(row, acc);
      if (!ledger) {
        return 0;
      }
      return this.manualToReviewCounts[ledger] ?? 0;
    },
    plaidFeedDisconnectedIds(row: PlaidFeedItemRow): Set<string> {
      return new Set(
        (row.feed_disconnected_account_ids ?? []).map((id) => String(id))
      );
    },
    isPlaidAccountFeedDisconnected(
      row: PlaidFeedItemRow,
      acc: PlaidLinkedAccountRow
    ): boolean {
      return this.plaidFeedDisconnectedIds(row).has(acc.account_id);
    },
    /** Sub-accounts at this institution that still receive Plaid imports (not in paused list). */
    activePlaidFeedCount(row: PlaidFeedItemRow): number {
      const linked = this.linkedAccountsByItem[row.item_id] ?? [];
      const disc = this.plaidFeedDisconnectedIds(row);
      return linked.filter((a) => !disc.has(a.account_id)).length;
    },
    /** True if disconnecting this row would remove the whole Plaid Item (last active sub-account). */
    disconnectingWouldRemoveEntireInstitution(
      row: PlaidFeedItemRow,
      acc: PlaidLinkedAccountRow
    ): boolean {
      if (this.isPlaidAccountFeedDisconnected(row, acc)) {
        return false;
      }
      return this.activePlaidFeedCount(row) === 1;
    },
    institutionDisplayName(row: PlaidFeedItemRow): string {
      return row.institution_name?.trim() || row.item_id;
    },
    plaidLedgerBalanceLabel(
      row: PlaidFeedItemRow,
      acc: PlaidLinkedAccountRow
    ): string {
      const name = this.plaidRowLedgerName(row, acc);
      if (!name) {
        return t`—`;
      }
      const rt = this.chartBankAccounts.find((c) => c.name === name)?.rootType;
      return this.ledgerBalanceLabelForName(name, rt);
    },
    async confirmDisconnectPlaid(
      row: PlaidFeedItemRow,
      acc: PlaidLinkedAccountRow
    ) {
      if (!this.bookId) {
        showToast({
          type: 'error',
          message: t`Sign into LiveBooks Cloud to use online bank feeds here.`,
        });
        return;
      }
      const accLabel = this.labelForPlaid(acc);
      const instName = this.institutionDisplayName(row);
      const removesWholeLink =
        this.disconnectingWouldRemoveEntireInstitution(row, acc);
      const confirmed = (await showDialog({
        type: 'warning',
        title: removesWholeLink
          ? t`Disconnect entire bank from Plaid?`
          : t`Disconnect feed?`,
        detail: removesWholeLink
          ? t`"${accLabel}" is the last sub-account still receiving automatic imports under ${instName}. Disconnecting it removes the whole institution from Plaid and stops all feeds for this bank until you connect it again. Your ledger accounts and history stay in the books.`
          : t`This pauses automatic imports for ${accLabel}. Other linked accounts under ${instName} can keep syncing. Your ledger history does not change — you can import CSVs if you like.`,
        buttons: [
          {
            label: t`Cancel`,
            action: () => false,
            isEscape: true,
          },
          {
            label: removesWholeLink
              ? t`Disconnect institution`
              : t`Disconnect feed`,
            isPrimary: true,
            action: () => true,
          },
        ],
      })) as boolean;
      if (!confirmed) {
        return;
      }
      const res = await disconnectPlaidAccountFeedLocalAndRemote(
        this.bookId,
        row.item_id,
        acc.account_id,
        { promptTotp: () => this.plaidMfaPromptTotp() }
      );
      if (!res.ok) {
        showToast({ type: 'error', message: res.error });
        return;
      }
      showToast({
        type: 'success',
        message: res.itemRemoved
          ? t`Bank institution disconnected from Plaid. You can still use manual CSV imports.`
          : t`Feed disconnected for this account. Other accounts at this institution may keep syncing.`,
      });
      await this.loadChartBankAccountsForMaps();
      await this.refreshFeeds(false);
      await this.loadManualSection();
    },
    async reactivatePlaidAccountFeed(
      row: PlaidFeedItemRow,
      acc: PlaidLinkedAccountRow
    ) {
      if (!this.bookId) {
        showToast({
          type: 'error',
          message: t`Sign into LiveBooks Cloud to use online bank feeds here.`,
        });
        return;
      }
      const k = this.selKey(row.item_id, acc.account_id);
      this.reactivateFeedBusy = { ...this.reactivateFeedBusy, [k]: true };
      try {
        const en = await enablePlaidAccountFeed(
          this.bookId,
          row.item_id,
          acc.account_id,
          { promptTotp: () => this.plaidMfaPromptTotp() }
        );
        if (!en.ok) {
          showToast({ type: 'error', message: en.error ?? t`Could not reactivate feed.` });
          return;
        }
        showToast({
          type: 'success',
          message: t`Feed reactivated. Imports will resume on the next sync.`,
        });
        await this.refreshFeeds(false);
        await this.loadManualSection({ quiet: true });
      } finally {
        const next = { ...this.reactivateFeedBusy };
        delete next[k];
        this.reactivateFeedBusy = next;
      }
    },
    async confirmReopenImportBatches(row: PlaidFeedItemRow) {
      if (!this.bookId) {
        showToast({
          type: 'error',
          message: t`Sign into LiveBooks Cloud to use online bank feeds here.`,
        });
        return;
      }
      const instName = this.institutionDisplayName(row);
      const confirmed = (await showDialog({
        type: 'info',
        title: t`Re-fetch missing bank data?`,
        detail: t`This re-opens recently acknowledged imports for ${instName} so this computer can download them again if rows were deleted locally. Data must still exist on LiveBooks Cloud (typically within 90 days). It does not request new history from the bank.`,
        buttons: [
          {
            label: t`Cancel`,
            action: () => false,
            isEscape: true,
          },
          {
            label: t`Re-fetch`,
            isPrimary: true,
            action: () => true,
          },
        ],
      })) as boolean;
      if (!confirmed) {
        return;
      }
      this.reopenImportBusy = { ...this.reopenImportBusy, [row.item_id]: true };
      try {
        const res = await reopenAckedPlaidImportBatches(
          this.bookId,
          row.item_id,
          { days: 30, promptTotp: () => this.plaidMfaPromptTotp() }
        );
        if (!res.ok) {
          showToast({
            type: 'error',
            message: res.error ?? t`Re-fetch failed.`,
          });
          return;
        }
        if ((res.reopenedCount ?? 0) === 0) {
          showToast({
            type: 'info',
            message: t`Nothing to re-fetch in the last ${String(
              res.days ?? 30
            )} days, or those batches were already deleted from LiveBooks Cloud.`,
          });
        } else {
          showToast({
            type: 'success',
            message: t`Re-opened ${String(
              res.reopenedCount
            )} batch(es). Open Bank Account Activity for each mapped account to merge them into For Review.`,
          });
        }
        await this.refreshFeeds(false);
        await this.loadManualSection({ quiet: true });
      } finally {
        const next = { ...this.reopenImportBusy };
        delete next[row.item_id];
        this.reopenImportBusy = next;
      }
    },
    async confirmArchiveManualBank(accountName: string) {
      const n = await countLedgerRowsForAccount(accountName);
      if (n === 0) {
        showToast({
          type: 'info',
          message: t`This account has no ledger history — use Delete account instead.`,
        });
        await this.loadManualSection({ quiet: true });
        return;
      }
      const bal = await ledgerSignedBalanceForAccount(accountName);
      if (bal != null && Math.abs(bal) > 0.005) {
        await showDialog({
          type: 'error',
          title: t`Cannot archive this account`,
          detail: t`This account still has a ${fyo.format(
            bal,
            'Currency'
          )} balance in your books. Record a transfer to zero the balance before archiving.`,
          buttons: [
            { label: t`OK`, action: () => true, isPrimary: true, isEscape: true },
          ],
        });
        return;
      }
      const ok = (await showDialog({
        type: 'warning',
        title: t`Archive this account?`,
        detail: t`Archiving hides this account from your daily bank feeds and most pickers, but keeps your historical reports accurate. Unreviewed feed lines for this account will be marked excluded.`,
        buttons: [
          { label: t`Cancel`, action: () => false, isEscape: true },
          {
            label: t`Archive account`,
            isPrimary: true,
            action: () => true,
          },
        ],
      })) as boolean;
      if (!ok) {
        return;
      }
      const ar = await archiveBankAccount(accountName);
      if (!ar.ok) {
        showToast({ type: 'error', message: ar.error });
        return;
      }
      showToast({ type: 'success', message: t`Account archived.` });
      await this.loadChartBankAccountsForMaps();
      await this.loadManualSection();
    },
    async confirmRestoreManualBank(
      accountName: string,
      displayName?: string
    ) {
      const label = displayName?.trim() || accountName;
      const ok = (await showDialog({
        type: 'info',
        title: t`Restore this account?`,
        detail: t`Restoring makes "${label}" available again in bank feeds and account pickers. You can re-connect Plaid or import statements afterward if needed.`,
        buttons: [
          { label: t`Cancel`, action: () => false, isEscape: true },
          {
            label: t`Restore account`,
            isPrimary: true,
            action: () => true,
          },
        ],
      })) as boolean;
      if (!ok) {
        return;
      }
      const ur = await unarchiveBankAccount(accountName);
      if (!ur.ok) {
        showToast({ type: 'error', message: ur.error });
        return;
      }
      showToast({ type: 'success', message: t`Account restored.` });
      await this.loadChartBankAccountsForMaps();
      await this.loadManualSection();
    },
    async refreshPlaidInstitution(itemId: string) {
      if (!this.bookId || this.refreshItemBusy[itemId]) {
        return;
      }
      this.refreshItemBusy = { ...this.refreshItemBusy, [itemId]: true };
      try {
        await this.refreshFeeds(false, {
          linkedPrefetch: 'single',
          singleItemId: itemId,
        });
      } finally {
        const next = { ...this.refreshItemBusy };
        delete next[itemId];
        this.refreshItemBusy = next;
      }
    },
    async refreshFeeds(
      useEtag: boolean,
      options?: {
        linkedPrefetch?: 'all' | 'single';
        singleItemId?: string;
      }
    ) {
      if (!this.bookId) {
        return;
      }
      const linkedPrefetch = options?.linkedPrefetch ?? 'all';
      const singleItemId = options?.singleItemId;
      if (linkedPrefetch === 'single' && !singleItemId) {
        return;
      }
      this.feedsLoading = !useEtag && linkedPrefetch === 'all';
      this.feedsError = '';
      const res = await fetchPlaidFeedsWithStepUp(this.bookId, {
        ifNoneMatch: useEtag ? this.feedsEtag : undefined,
      });
      this.feedsLoading = false;
      if (res.error) {
        this.feedsError = res.error;
        return;
      }
      if (res.notModified) {
        if (linkedPrefetch === 'single' && singleItemId) {
          await this.loadLinkedAccountsForItem(singleItemId);
          await this.hydratePlaidLedgerTxCounts();
        }
        return;
      }
      if (res.payload) {
        this.feedItems = res.payload.items ?? [];
        if (res.etag) {
          this.feedsEtag = res.etag;
        }
        if (linkedPrefetch === 'all') {
          this.linkedAccountsByItem = {};
          this.linkedAccountsError = {};
          this.linkedAccountsLoading = {};
          this.linkedAccountsFetched = {};
          await this.prefetchLinkedForAllItems();
        } else {
          await this.loadLinkedAccountsForItem(singleItemId!);
          await this.hydratePlaidLedgerTxCounts();
        }
      }
    },
    async prefetchLinkedForAllItems() {
      await Promise.all(
        this.feedItems
          .filter((r) => !r.item_login_required)
          .map((r) => this.loadLinkedAccountsForItem(r.item_id))
      );
      await this.hydratePlaidLedgerTxCounts();
    },
    async hydratePlaidLedgerTxCounts() {
      const names = new Set<string>();
      for (const row of this.feedItems) {
        for (const acc of this.linkedAccountsByItem[row.item_id] ?? []) {
          const ledger = this.ledgerNameForPlaidAccount(
            row.item_id,
            acc.account_id
          );
          if (ledger) {
            names.add(ledger);
          }
        }
      }
      const next: Record<string, number> = {};
      for (const ledger of names) {
        try {
          next[ledger] = await countLedgerRowsForAccount(ledger);
        } catch {
          next[ledger] = 0;
        }
      }
      this.plaidLedgerRowCounts = next;
    },
    plaidAccountLifecycleActions(
      row: PlaidFeedItemRow,
      acc: PlaidLinkedAccountRow
    ): Action[] {
      const ledger = this.plaidRowLedgerName(row, acc);
      if (!ledger) {
        return [];
      }
      const n = this.plaidLedgerRowCounts[ledger] ?? 0;
      if (n === 0) {
        return [
          {
            label: t`Delete account`,
            action: async () => {
              await this.confirmDeletePlaidMappedAccount(row, acc, ledger);
            },
          } as Action,
        ];
      }
      return [
        {
          label: t`Archive account`,
          action: async () => {
            await this.confirmArchivePlaidMappedAccount(row, acc, ledger);
          },
        } as Action,
      ];
    },
    manualBankLifecycleActions(
      accountName: string,
      archived = false,
      displayName?: string
    ): Action[] {
      if (archived) {
        return [
          {
            label: t`Restore`,
            action: async () => {
              await this.confirmRestoreManualBank(accountName, displayName);
            },
          } as Action,
        ];
      }
      const n = this.manualLedgerRowCounts[accountName] ?? 0;
      if (n === 0) {
        return [
          {
            label: t`Delete`,
            action: async () => {
              await this.confirmDeleteManualBank(accountName);
            },
          } as Action,
        ];
      }
      return [
        {
          label: t`Archive`,
          action: async () => {
            await this.confirmArchiveManualBank(accountName);
          },
        } as Action,
      ];
    },
    async runManualBankLifecycleAction(
      accountName: string,
      archived = false,
      displayName?: string
    ) {
      const [action] = this.manualBankLifecycleActions(
        accountName,
        archived,
        displayName
      );
      if (action?.action) {
        await action.action();
      }
    },
    async confirmDeletePlaidMappedAccount(
      row: PlaidFeedItemRow,
      acc: PlaidLinkedAccountRow,
      accountName: string
    ) {
      if (!this.bookId) {
        showToast({
          type: 'error',
          message: t`Sign into LiveBooks Cloud to use online bank feeds here.`,
        });
        return;
      }
      const n = await countLedgerRowsForAccount(accountName);
      if (n > 0) {
        showToast({
          type: 'error',
          message: t`This account has ledger history and cannot be deleted. Archive it instead.`,
        });
        await this.hydratePlaidLedgerTxCounts();
        return;
      }
      const instName = this.institutionDisplayName(row);
      const removesWholeLink =
        this.disconnectingWouldRemoveEntireInstitution(row, acc);
      const ok = (await showDialog({
        type: 'warning',
        title: removesWholeLink
          ? t`Delete account and disconnect bank from Plaid?`
          : t`Delete this account?`,
        detail: removesWholeLink
          ? t`This removes "${accountName}" from your books. It is the last sub-account still syncing under ${instName}, so LiveBooks will also disconnect the entire institution from Plaid until you connect the bank again.`
          : t`This removes "${accountName}" from your books and pauses automatic imports for this Plaid sub-account. Other linked accounts under ${instName} can keep syncing.`,
        buttons: [
          { label: t`Cancel`, action: () => false, isEscape: true },
          {
            label: removesWholeLink
              ? t`Delete and disconnect institution`
              : t`Delete account`,
            isPrimary: true,
            action: () => true,
          },
        ],
      })) as boolean;
      if (!ok) {
        return;
      }
      const disc = await disconnectPlaidAccountFeedLocalAndRemote(
        this.bookId,
        row.item_id,
        acc.account_id,
        { promptTotp: () => this.plaidMfaPromptTotp() }
      );
      if (!disc.ok) {
        showToast({ type: 'error', message: disc.error });
        return;
      }
      const del = await deleteEmptyBankAccount(accountName);
      if (!del.ok) {
        showToast({ type: 'error', message: del.error });
        await this.loadChartBankAccountsForMaps();
        await this.refreshFeeds(false);
        await this.loadManualSection();
        return;
      }
      showToast({
        type: 'success',
        message: disc.itemRemoved
          ? t`Account deleted and bank institution disconnected from Plaid.`
          : t`Account deleted. Other accounts at this bank may keep syncing.`,
      });
      await this.loadChartBankAccountsForMaps();
      await this.refreshFeeds(false);
      await this.loadManualSection();
    },
    async confirmArchivePlaidMappedAccount(
      row: PlaidFeedItemRow,
      acc: PlaidLinkedAccountRow,
      accountName: string
    ) {
      if (!this.bookId) {
        showToast({
          type: 'error',
          message: t`Sign into LiveBooks Cloud to use online bank feeds here.`,
        });
        return;
      }
      const n = await countLedgerRowsForAccount(accountName);
      if (n === 0) {
        showToast({
          type: 'info',
          message: t`This account has no ledger history — use Delete account instead.`,
        });
        await this.hydratePlaidLedgerTxCounts();
        return;
      }
      const instName = this.institutionDisplayName(row);
      const removesWholeLink =
        this.disconnectingWouldRemoveEntireInstitution(row, acc);
      const bal = await ledgerSignedBalanceForAccount(accountName);
      if (bal != null && Math.abs(bal) > 0.005) {
        await showDialog({
          type: 'error',
          title: t`Cannot archive this account`,
          detail: t`This account still has a ${fyo.format(
            bal,
            'Currency'
          )} balance in your books. Record a transfer to zero the balance before archiving.`,
          buttons: [
            { label: t`OK`, action: () => true, isPrimary: true, isEscape: true },
          ],
        });
        return;
      }
      const detail = removesWholeLink
        ? t`Archiving hides "${accountName}" from your daily bank feeds and most pickers, but keeps your historical reports accurate. Unreviewed feed lines for this account will be marked excluded. This is the last sub-account still syncing under ${instName}; archiving will also disconnect the entire institution from Plaid until you connect the bank again.`
        : t`Archiving hides "${accountName}" from your daily bank feeds and most pickers, but keeps your historical reports accurate. Unreviewed feed lines for this account will be marked excluded. Automatic imports for this Plaid sub-account stop; other linked accounts under ${instName} can keep syncing.`;
      const ok = (await showDialog({
        type: 'warning',
        title: removesWholeLink
          ? t`Archive account and disconnect bank from Plaid?`
          : t`Archive this account?`,
        detail,
        buttons: [
          { label: t`Cancel`, action: () => false, isEscape: true },
          {
            label: removesWholeLink
              ? t`Archive and disconnect institution`
              : t`Archive account`,
            isPrimary: true,
            action: () => true,
          },
        ],
      })) as boolean;
      if (!ok) {
        return;
      }
      const disc = await disconnectPlaidAccountFeedLocalAndRemote(
        this.bookId,
        row.item_id,
        acc.account_id,
        { promptTotp: () => this.plaidMfaPromptTotp() }
      );
      if (!disc.ok) {
        showToast({ type: 'error', message: disc.error });
        return;
      }
      const ar = await archiveBankAccount(accountName);
      if (!ar.ok) {
        showToast({ type: 'error', message: ar.error });
        await this.loadChartBankAccountsForMaps();
        await this.refreshFeeds(false);
        await this.loadManualSection();
        return;
      }
      showToast({
        type: 'success',
        message: disc.itemRemoved
          ? t`Account archived and bank institution disconnected from Plaid.`
          : t`Account archived. Other accounts at this bank may keep syncing.`,
      });
      await this.loadChartBankAccountsForMaps();
      await this.refreshFeeds(false);
      await this.loadManualSection();
    },
    async confirmDeleteManualBank(accountName: string) {
      const n = await countLedgerRowsForAccount(accountName);
      if (n > 0) {
        showToast({
          type: 'error',
          message: t`This account has ledger history and cannot be deleted. Archive it instead.`,
        });
        await this.loadManualSection({ quiet: true });
        return;
      }
      const ok = (await showDialog({
        type: 'warning',
        title: t`Delete this account?`,
        detail: t`This permanently removes "${accountName}" and its manual feed data from your books.`,
        buttons: [
          { label: t`Cancel`, action: () => false, isEscape: true },
          {
            label: t`Delete account`,
            isPrimary: true,
            action: () => true,
          },
        ],
      })) as boolean;
      if (!ok) {
        return;
      }
      const del = await deleteEmptyBankAccount(accountName);
      if (!del.ok) {
        showToast({ type: 'error', message: del.error });
        return;
      }
      showToast({ type: 'success', message: t`Account deleted.` });
      await this.loadChartBankAccountsForMaps();
      await this.loadManualSection();
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
    selKey(itemId: string, plaidAccountId: string) {
      return `${itemId}\x1f${plaidAccountId}`;
    },
    labelForPlaid(acc: PlaidLinkedAccountRow) {
      return formatPlaidLinkedRowLabel(acc);
    },
    /**
     * Returns the saved PlaidBankAccountMap row that already claims `chartName`,
     * if any, *excluding* the row owned by `(itemId, plaidAccountId)`. Used to
     * enforce the 1:1 rule between a ledger account and a Plaid sub-account.
     */
    chartAccountOwnerOther(
      itemId: string,
      plaidAccountId: string,
      chartName: string
    ): PlaidMapRow | null {
      if (!chartName) {
        return null;
      }
      for (const m of this.manualPlaidMaps) {
        if (m.chartAccount !== chartName) {
          continue;
        }
        if (m.plaidItemId === itemId && m.plaidAccountId === plaidAccountId) {
          continue;
        }
        return m;
      }
      return null;
    },
    isChartAccountTakenByOther(
      itemId: string,
      plaidAccountId: string,
      chartName: string
    ): boolean {
      return this.chartAccountOwnerOther(itemId, plaidAccountId, chartName) !== null;
    },
    chartOptionLabel(
      itemId: string,
      plaidAccountId: string,
      chartName: string
    ): string {
      const coa = this.chartBankAccounts.find((c) => c.name === chartName);
      const label = coa ? accountDisplayName(coa) : chartName;
      const owner = this.chartAccountOwnerOther(itemId, plaidAccountId, chartName);
      if (!owner) {
        return label;
      }
      const ownerLabel = owner.plaidDisplayLabel || owner.plaidAccountId;
      return t`${label} — already mapped to ${ownerLabel}`;
    },
    chartMappingField(itemId: string, plaidAccountId: string): Field {
      const selected =
        this.chartSelections[this.selKey(itemId, plaidAccountId)] ?? '';
      const options = this.chartBankAccounts
        .filter((coa) => {
          if (coa.name === selected) {
            return true;
          }
          return !this.isChartAccountTakenByOther(
            itemId,
            plaidAccountId,
            coa.name
          );
        })
        .map((coa) => ({
          label: this.chartOptionLabel(itemId, plaidAccountId, coa.name),
          value: coa.name,
        }));
      return {
        fieldtype: 'AutoComplete',
        fieldname: 'chartAccount',
        placeholder: t`Select bank account…`,
        options,
      } as Field;
    },
    onChartSelectionChange(
      itemId: string,
      plaidAccountId: string,
      value: string | null
    ) {
      const key = this.selKey(itemId, plaidAccountId);
      this.chartSelections = {
        ...this.chartSelections,
        [key]: value || '',
      };
    },
    async savePlaidMapping(itemId: string, acc: PlaidLinkedAccountRow) {
      const row = this.feedItems.find((r) => r.item_id === itemId);
      if (row && this.isPlaidAccountFeedDisconnected(row, acc)) {
        showToast({
          type: 'error',
          message: t`Reactivate this feed before saving or changing the mapping.`,
        });
        return;
      }
      const key = this.selKey(itemId, acc.account_id);
      const chart = this.chartSelections[key];
      if (!chart) {
        showToast({
          type: 'error',
          message: t`Choose a chart of accounts bank account before saving.`,
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
        showToast({
          type: 'error',
          message: t`"${chart}" is already mapped to Plaid account ${ownerLabel}. Each ledger account can only be linked to one Plaid sub-account — pick a different ledger or unmap the other Plaid account first.`,
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
        this.manualPlaidMaps = await loadPlaidAccountMaps();
        await this.loadManualSection({ quiet: true });
        await this.hydratePlaidLedgerTxCounts();
        showToast({ type: 'success', message: t`Mapping saved.` });
        const en = await enablePlaidAccountFeed(
          this.bookId,
          itemId,
          acc.account_id,
          { promptTotp: () => this.plaidMfaPromptTotp() }
        );
        if (!en.ok) {
          showToast({
            type: 'warning',
            message: en.error ?? t`The cloud could not resume automatic imports for this account (use Refresh for this institution).`,
          });
        }
        // Reopen recently acked batches so previously-unmapped account history
        // can re-deliver (unmapped rows were excluded then acked).
        if (isNewMap && this.bookId) {
          const reopen = await reopenAckedPlaidImportBatches(
            this.bookId,
            itemId,
            { days: 90, promptTotp: () => this.plaidMfaPromptTotp() }
          );
          if (reopen.ok) {
            if ((reopen.reopenedCount ?? 0) > 0) {
              showToast({
                type: 'success',
                message: t`Reopened ${reopen.reopenedCount} bank feed batch(es) so history can catch up.`,
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
          } else if (!reopen.totpRequired) {
            showToast({
              type: 'warning',
              message:
                reopen.error ??
                t`Could not re-fetch prior bank batches. Import a CSV/OFX if history is missing.`,
              duration: 'long',
            });
          }
        }
      } catch (e) {
        showToast({
          type: 'error',
          message: (e as Error).message,
        });
      }
    },
    async linkBankWithPlaid(itemId?: string) {
      if (!this.bookId) {
        showToast({
          type: 'error',
          message: t`Sign into LiveBooks Cloud to use online bank feeds here.`,
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
        await openPlaidLinkModal({
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
          },
        });
      } catch (e) {
        showToast({
          type: 'error',
          message: (e as Error).message,
        });
      } finally {
        this.plaidLinkBusy = false;
      }
    },
    async loadManualSection(opts?: { quiet?: boolean }) {
      if (!opts?.quiet) {
        this.manualLoading = true;
      }
      try {
        this.manualPlaidMaps = await loadPlaidAccountMaps();
        const [active, archived] = await Promise.all([
          loadAllBankCoaAccounts(),
          loadArchivedBankCoaAccounts(),
        ]);
        this.manualBankCoaAccounts = [...active, ...archived];
        const reviewCounts: Record<string, number> = {};
        const ledgerCounts: Record<string, number> = {};
        for (const a of this.manualBankCoaAccounts) {
          if (!isManualBankAccount(a.name, this.manualPlaidMaps)) {
            continue;
          }
          if (a.disabled) {
            reviewCounts[a.name] = 0;
            try {
              ledgerCounts[a.name] = await countLedgerRowsForAccount(a.name);
            } catch {
              ledgerCounts[a.name] = 0;
            }
            continue;
          }
          try {
            reviewCounts[a.name] = await manualPendingCountFor(a.name);
          } catch {
            reviewCounts[a.name] = 0;
          }
          try {
            ledgerCounts[a.name] = await countLedgerRowsForAccount(a.name);
          } catch {
            ledgerCounts[a.name] = 0;
          }
        }
        this.manualToReviewCounts = reviewCounts;
        this.manualLedgerRowCounts = ledgerCounts;
        await this.loadTotalsByAccount();
      } finally {
        if (!opts?.quiet) {
          this.manualLoading = false;
        }
      }
    },
    openManualPanel() {
      this.manualForm = {
        kind: 'bank',
        accountName: '',
        openingBalance: '0',
        openingDate: todayIsoDate(),
      };
      this.manualNameError = '';
      this.manualPanelOpen = true;
      void nextTick(() => {
        const el = this.$refs.manualNameInput as HTMLInputElement | undefined;
        if (el && typeof el.focus === 'function') {
          el.focus();
        }
      });
    },
    closeManualPanel() {
      if (this.manualSaving) {
        return;
      }
      this.manualPanelOpen = false;
      this.manualNameError = '';
    },
    openManualActivity(accountName: string) {
      void routeTo(
        `/bank-feeds/activity/${encodeURIComponent(accountName)}`
      );
    },
    async trySaveManual() {
      if (this.manualSaving || !this.canSaveManual) {
        if (!this.canSaveManual) {
          showToast({
            type: 'error',
            message: t`Enter account name, opening date, and opening balance.`,
          });
        }
        return;
      }
      this.manualNameError = '';
      this.manualSaving = true;
      try {
        const result = await createManualBankAccount(fyo, {
          accountName: this.manualForm.accountName,
          kind: this.manualForm.kind,
          openingBalance: this.manualForm.openingBalance,
          openingDate: this.manualForm.openingDate,
        });
        if (!result.ok) {
          if (result.error === t`An account with this name already exists.`) {
            this.manualNameError = result.error;
          } else {
            showToast({ type: 'error', message: result.error });
          }
          return;
        }
        if (result.openingBalanceWarning) {
          showToast({ type: 'error', message: result.openingBalanceWarning });
        }
        showToast({
          type: 'success',
          message: t`Manual bank added.`,
        });
        this.manualPanelOpen = false;
        await this.loadManualSection();
        this.openManualActivity(result.accountName);
      } finally {
        this.manualSaving = false;
      }
    },
  },
});
</script>
