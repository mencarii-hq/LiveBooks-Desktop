<template>
  <div class="flex flex-col h-full">
    <PageHeader :title="t`Chart of Accounts`">
      <Button @click="exportCsv">{{ t`Export (CSV)` }}</Button>
      <Button v-if="!isAllExpanded" @click="expand">{{ t`Expand` }}</Button>
      <Button v-if="!isAllCollapsed" @click="collapse">{{
        t`Collapse`
      }}</Button>
    </PageHeader>

    <!-- Chart of Accounts -->
    <div
      v-if="root"
      class="
        flex-1 flex flex-col
        overflow-y-auto
        mb-4
        custom-scroll custom-scroll-thumb1
      "
    >
      <!-- Chart of Accounts Indented List -->
      <template v-for="account in allAccounts" :key="account.id">
        <!-- Account List Item -->
        <div
          class="
            py-2
            cursor-pointer
            hover:bg-gray-50
            dark:hover:bg-gray-890 dark:text-gray-25
            group
            flex
            items-center
            border-b
            dark:border-gray-800
            flex-shrink-0
            pe-4
          "
          :class="[
            account.level !== 0 ? 'text-base' : 'text-lg',
            isQuickEditOpen(account) ? 'bg-gray-200 dark:bg-gray-700' : '',
          ]"
          :style="getItemStyle(account.level)"
          @click="onClick(account)"
        >
          <component
            :is="getIconComponent(!!account.isGroup, accountDisplay(account))"
          />
          <div class="flex items-baseline">
            <div
              class="ms-4"
              :class="[!account.parentAccount && 'font-semibold']"
            >
              {{ accountDisplay(account) }}
            </div>

            <!-- Row actions: always visible (muted), clearer on hover -->
            <div
              class="
                ms-6
                flex flex-wrap
                items-center
                opacity-60
                group-hover:opacity-100
                focus-within:opacity-100
              "
            >
              <button
                class="
                  text-xs text-gray-800
                  dark:text-gray-300
                  hover:text-gray-900
                  dark:hover:text-gray-100
                  focus:outline-none
                "
                @click.stop="editAccount(account)"
              >
                {{ t`Edit` }}
              </button>
              <button
                v-if="account.isGroup"
                class="
                  ms-3
                  text-xs text-gray-800
                  dark:text-gray-300
                  hover:text-gray-900
                  dark:hover:text-gray-100
                  focus:outline-none
                "
                @click.stop="addAccount(account, 'addingAccount')"
              >
                {{ t`Add Account` }}
              </button>
              <button
                v-if="account.isGroup"
                class="
                  ms-3
                  text-xs text-gray-800
                  dark:text-gray-300
                  hover:text-gray-900
                  dark:hover:text-gray-100
                  focus:outline-none
                "
                @click.stop="addAccount(account, 'addingGroupAccount')"
              >
                {{ t`Add Group` }}
              </button>
            </div>
          </div>

          <!-- Account Balance String -->
          <p
            v-if="!account.isGroup"
            class="ms-auto text-base text-gray-800 dark:text-gray-300"
          >
            {{ getBalanceString(account) }}
          </p>
        </div>

        <!-- Add Account/Group -->
        <div
          v-if="account.addingAccount || account.addingGroupAccount"
          :key="account.name + '-adding-account'"
          class="
            px-4
            border-b
            dark:border-gray-800
            cursor-pointer
            hover:bg-gray-50
            dark:hover:bg-gray-890
            group
            flex
            items-center
            text-base
          "
          :style="getGroupStyle(account.level + 1)"
        >
          <component :is="getIconComponent(account.addingGroupAccount)" />
          <div class="flex ms-4 h-row-mid items-center">
            <input
              :ref="account.name"
              v-model="newAccountName"
              class="
                focus:outline-none
                bg-transparent
                dark:placeholder-gray-600 dark:text-gray-300
              "
              :class="{ 'text-gray-600 dark:text-gray-300': insertingAccount }"
              :placeholder="t`New Account`"
              type="text"
              :disabled="insertingAccount"
              @keydown.esc="cancelAddingAccount(account)"
              @keydown.enter="
                (e) => createNewAccount(account, account.addingGroupAccount)
              "
            />
            <button
              v-if="!insertingAccount"
              class="
                ms-4
                text-xs text-gray-800
                dark:text-gray-300
                hover:text-gray-900
                dark:hover:text-gray-100
                focus:outline-none
              "
              @click="
                (e) => createNewAccount(account, account.addingGroupAccount)
              "
            >
              {{ t`Save` }}
            </button>
            <button
              v-if="!insertingAccount"
              class="
                ms-4
                text-xs text-gray-800
                dark:text-gray-300
                hover:text-gray-900
                dark:hover:text-gray-100
                focus:outline-none
              "
              @click="cancelAddingAccount(account)"
            >
              {{ t`Cancel` }}
            </button>
          </div>
        </div>
      </template>
    </div>

    <!-- Hard delete: type account/group name to confirm -->
    <Modal :open-modal="!!cascadeDeleteTarget" @closemodal="closeCascadeDelete">
      <div class="p-4 text-gray-900 dark:text-gray-100 w-form">
        <h2 class="text-xl font-semibold select-none">
          {{ t`Delete ${cascadeDeleteLabel}?` }}
        </h2>
        <p class="text-base mt-2">
          <template v-if="isCascadeDelete">
            {{
              t`This permanently deletes this group and every account under it (${cascadeDeleteCount} total). It cannot be undone.`
            }}
          </template>
          <template v-else-if="cascadeDeleteTarget?.isGroup">
            {{ t`This permanently deletes this group. It cannot be undone.` }}
          </template>
          <template v-else>
            {{ t`This permanently deletes this account. It cannot be undone.` }}
          </template>
        </p>
        <p
          v-if="isCascadeDelete"
          class="text-sm text-red-600 dark:text-red-400 mt-2"
        >
          {{
            t`Accounts that still have transactions or other links will be kept. If any remain, the group itself may not be deleted.`
          }}
        </p>
        <div
          v-if="isCascadeDelete && cascadeDeleteNames.length"
          class="
            mt-3
            max-h-40
            overflow-y-auto
            text-sm text-gray-700
            dark:text-gray-300
            custom-scroll custom-scroll-thumb1
            border
            dark:border-gray-800
            rounded
            p-2
          "
        >
          <p v-for="name in cascadeDeleteNames" :key="name">{{ name }}</p>
        </div>
        <p class="text-sm text-red-600 dark:text-red-400 mt-4">
          {{ t`Type "${cascadeDeleteLabel}" to confirm.` }}
        </p>
        <input
          v-model="cascadeConfirmInput"
          type="text"
          class="
            mt-2
            w-full
            bg-gray-100
            dark:bg-gray-800
            focus:bg-gray-200
            dark:focus:bg-gray-700
            rounded-md
            px-2
            py-1.5
            outline-none
            text-base
          "
          :placeholder="cascadeDeleteLabel"
          :disabled="cascadeDeleting"
          @keydown.enter="confirmCascadeDelete"
        />
        <div class="flex justify-between mt-6">
          <Button :disabled="cascadeDeleting" @click="closeCascadeDelete">{{
            t`Cancel`
          }}</Button>
          <Button
            type="primary"
            :disabled="!canConfirmCascadeDelete || cascadeDeleting"
            @click="confirmCascadeDelete"
          >
            {{ t`Delete Permanently` }}
          </Button>
        </div>
      </div>
    </Modal>
  </div>
</template>
<script lang="ts">
import { t } from 'fyo';
import { isCredit } from 'models/helpers';
import { ModelNameEnum } from 'models/types';
import PageHeader from 'src/components/PageHeader.vue';
import Modal from 'src/components/Modal.vue';
import { fyo } from 'src/initFyo';
import { languageDirectionKey } from 'src/utils/injectionKeys';
import { docsPathMap } from 'src/utils/misc';
import { docsPathRef } from 'src/utils/refs';
import { getSavePath, openQuickEdit, showExportInFolder } from 'src/utils/ui';
import { getMapFromList, removeAtIndex } from 'utils/index';
import { generateCSV } from 'utils/csvParser';
import { defineComponent, nextTick } from 'vue';
import Button from '../components/Button.vue';
import { inject } from 'vue';
import { handleErrorWithDialog } from '../errorHandling';
import { AccountRootType, AccountType } from 'models/baseModels/Account/types';
import { TreeViewSettings } from 'fyo/model/types';
import { Doc } from 'fyo/model/doc';
import { Component } from 'vue';
import { uicolors } from 'src/utils/colors';
import { showDialog } from 'src/utils/interactive';
import { accountDisplayName } from 'utils/accountDisplay';
import { getDbError, LinkValidationError } from 'fyo/utils/errors';
import { Verb } from 'fyo/telemetry/types';
import {
  registerChartOfAccountsDelete,
  unregisterChartOfAccountsDelete,
} from 'src/utils/chartOfAccountsActions';

type AccountItem = {
  name: string;
  accountName?: string;
  parentAccount: string;
  rootType: AccountRootType;
  accountType: AccountType;
  level: number;
  location: number[];
  isGroup?: boolean;
  disabled?: boolean;
  children: AccountItem[];
  expanded: boolean;
  addingAccount: boolean;
  addingGroupAccount: boolean;
};

type AccKey = 'addingAccount' | 'addingGroupAccount';

export default defineComponent({
  components: {
    Button,
    PageHeader,
    Modal,
  },
  props: {
    darkMode: { type: Boolean, default: false },
  },
  setup() {
    return {
      languageDirection: inject(languageDirectionKey),
    };
  },
  data() {
    return {
      isAllCollapsed: true,
      isAllExpanded: false,
      root: null as null | { label: string; balance: number; currency: string },
      accounts: [] as AccountItem[],
      schemaName: 'Account',
      newAccountName: '',
      insertingAccount: false,
      totals: {} as Record<string, { totalDebit: number; totalCredit: number }>,
      refetchTotals: false,
      settings: null as null | TreeViewSettings,
      cascadeDeleteTarget: null as null | AccountItem,
      cascadeDeleteItems: [] as AccountItem[],
      cascadeConfirmInput: '',
      cascadeDeleting: false,
    };
  },
  computed: {
    allAccounts() {
      const allAccounts: AccountItem[] = [];

      (function getAccounts(
        accounts: AccountItem[],
        level: number,
        location: number[]
      ) {
        for (let i = 0; i < accounts.length; i++) {
          const account = accounts[i];

          account.level = level;
          account.location = [...location, i];
          allAccounts.push(account);

          if (account.children != null && account.expanded) {
            getAccounts(account.children, level + 1, account.location);
          }
        }
      })(this.accounts, 0, []);

      return allAccounts;
    },
    cascadeDeleteLabel() {
      if (!this.cascadeDeleteTarget) {
        return '';
      }
      return this.accountDisplay(this.cascadeDeleteTarget);
    },
    cascadeDeleteCount() {
      return this.cascadeDeleteItems.length;
    },
    cascadeDeleteNames() {
      return this.cascadeDeleteItems.map((a) => this.accountDisplay(a));
    },
    isCascadeDelete() {
      return this.cascadeDeleteItems.length > 1;
    },
    canConfirmCascadeDelete() {
      if (!this.cascadeDeleteTarget) {
        return false;
      }
      return (
        this.cascadeConfirmInput.trim() ===
        this.accountDisplay(this.cascadeDeleteTarget)
      );
    },
  },
  async mounted() {
    registerChartOfAccountsDelete((name) => this.deleteAccountByName(name));
    await this.setTotalDebitAndCredit();
    fyo.doc.observer.on('sync:AccountingLedgerEntry', () => {
      this.refetchTotals = true;
    });
    fyo.doc.observer.on('sync:Account', async (name: string) => {
      if (!name) {
        return;
      }
      try {
        const doc = await fyo.doc.getDoc(ModelNameEnum.Account, name);
        this.patchAccountFromDoc(doc);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('ChartOfAccounts sync:Account patch failed', error);
      }
    });
  },
  async activated() {
    registerChartOfAccountsDelete((name) => this.deleteAccountByName(name));
    await this.fetchAccounts();
    if (fyo.store.isDevelopment) {
      // @ts-ignore
      window.coa = this;
    }

    docsPathRef.value = docsPathMap.ChartOfAccounts!;

    if (this.refetchTotals) {
      await this.setTotalDebitAndCredit();
      this.refetchTotals = false;
    }
  },
  deactivated() {
    unregisterChartOfAccountsDelete();
    docsPathRef.value = '';
  },
  methods: {
    accountDisplay(account: AccountItem) {
      return accountDisplayName(account);
    },
    async expand() {
      await this.toggleAll(this.accounts, true);
      this.isAllCollapsed = false;
      this.isAllExpanded = true;
    },
    async collapse() {
      await this.toggleAll(this.accounts, false);
      this.isAllExpanded = false;
      this.isAllCollapsed = true;
    },
    async toggleAll(accounts: AccountItem | AccountItem[], expand: boolean) {
      if (!Array.isArray(accounts)) {
        await this.toggle(accounts, expand);
        accounts = accounts.children ?? [];
      }

      for (const account of accounts) {
        await this.toggleAll(account, expand);
      }
    },
    async toggle(account: AccountItem, expand: boolean) {
      if (account.expanded === expand || !account.isGroup) {
        return;
      }

      await this.toggleChildren(account);
    },
    getBalance(account: AccountItem) {
      const total = this.totals[account.name];
      if (!total) {
        return 0;
      }

      const { totalCredit, totalDebit } = total;

      if (isCredit(account.rootType)) {
        return totalCredit - totalDebit;
      }

      return totalDebit - totalCredit;
    },
    getBalanceString(account: AccountItem) {
      const suffix = isCredit(account.rootType) ? t`Cr.` : t`Dr.`;
      const balance = this.getBalance(account);
      return `${fyo.format(balance, 'Currency')} ${suffix}`;
    },
    async setTotalDebitAndCredit() {
      const totals = await this.fyo.db.getTotalCreditAndDebit();
      this.totals = getMapFromList(totals, 'account');
    },
    async fetchAccounts() {
      this.settings =
        fyo.models[ModelNameEnum.Account]?.getTreeSettings(fyo) ?? null;
      const currency = this.fyo.singles.SystemSettings?.currency ?? '';
      const label = (await this.settings?.getRootLabel()) ?? '';

      this.root = {
        label,
        balance: 0,
        currency,
      };
      this.accounts = await this.getChildren();
    },
    async onClick(account: AccountItem) {
      // Groups with children only expand/collapse; empty groups and leaves open Quick Edit.
      let shouldOpen = !account.isGroup;
      if (account.isGroup) {
        shouldOpen = !(await this.toggleChildren(account));
      }

      if (account.isGroup && account.expanded) {
        this.isAllCollapsed = false;
      }

      if (account.isGroup && !account.expanded) {
        this.isAllExpanded = false;
      }

      if (!shouldOpen) {
        return;
      }

      await this.editAccount(account);
    },
    async editAccount(account: AccountItem) {
      const doc = await fyo.doc.getDoc(ModelNameEnum.Account, account.name);
      this.setOpenAccountDocListener(doc, account);
      await openQuickEdit({ doc });
    },
    setOpenAccountDocListener(
      doc: Doc,
      account?: AccountItem,
      parentAccount?: AccountItem
    ) {
      // Capture tree node + id at open time so afterSync still patches even if
      // doc.name changes (manual rename) or the AccountItem ref is stale.
      const treeAccount = account;
      const openedName = account?.name ?? doc.name;

      if (!doc.hasListener('afterDelete')) {
        doc.once('afterDelete', () => {
          this.removeAccount(doc.name!, treeAccount, parentAccount);
        });
      }

      if (!doc.hasListener('afterSync')) {
        doc.on('afterSync', () => {
          this.patchAccountFromDoc(doc, treeAccount, openedName);
        });
      }
    },
    patchAccountFromDoc(doc: Doc, account?: AccountItem, openedName?: string) {
      if (!account || account.name !== doc.name) {
        // Prefer current doc name, then the name at open time, then accountName.
        const found =
          this.findAccountItem(doc.name!) ||
          (openedName ? this.findAccountItem(openedName) : undefined) ||
          (account ? this.findAccountItem(account.name) : undefined) ||
          (doc.accountName
            ? this.findAccountItemByAccountName(doc.accountName as string)
            : undefined);
        if (!found) {
          return;
        }
        account = found;
      }
      // Keep tree key in sync if the Account doc id was renamed.
      if (doc.name && account.name !== doc.name) {
        account.name = doc.name;
      }
      if (doc.accountName != null) {
        account.accountName = doc.accountName as string;
      }
      if (doc.accountType != null) {
        account.accountType = doc.accountType as AccountType;
      }
      if (doc.rootType != null) {
        account.rootType = doc.rootType as AccountRootType;
      }
      if (doc.isGroup != null) {
        account.isGroup = doc.isGroup as boolean;
      }
      if (doc.disabled != null) {
        account.disabled = doc.disabled as boolean;
      }
    },
    findAccountItem(
      name: string,
      accounts?: AccountItem[]
    ): AccountItem | undefined {
      const list = accounts ?? this.accounts;
      for (const a of list) {
        if (a.name === name) {
          return a;
        }
        if (a.children?.length) {
          const found = this.findAccountItem(name, a.children);
          if (found) {
            return found;
          }
        }
      }
      return undefined;
    },
    findAccountItemByAccountName(
      accountName: string,
      accounts?: AccountItem[]
    ): AccountItem | undefined {
      const list = accounts ?? this.accounts;
      for (const a of list) {
        if (a.accountName === accountName) {
          return a;
        }
        if (a.children?.length) {
          const found = this.findAccountItemByAccountName(
            accountName,
            a.children
          );
          if (found) {
            return found;
          }
        }
      }
      return undefined;
    },
    async deleteAccountByName(name: string) {
      const account = this.findAccountItem(name);
      if (!account) {
        return;
      }
      await this.deleteAccount(account);
    },
    async deleteAccount(account: AccountItem) {
      // Hard gate for both leaves and groups: type name to confirm.
      await this.openCascadeDelete(account);
    },
    async handleAccountDeleteError(e: unknown, account: AccountItem) {
      if (!(e instanceof Error)) {
        return;
      }

      if (getDbError(e) === LinkValidationError) {
        await showDialog({
          type: 'error',
          title: t`Cannot Delete Account`,
          detail: t`Cannot delete "${this.accountDisplay(
            account
          )}" because it has linked ledger entries or other references.`,
        });
        return;
      }

      // Soften any remaining rethrows so delete never leaves an unhandled rejection.
      await handleErrorWithDialog(e, undefined, false, true);
    },
    async openCascadeDelete(account: AccountItem) {
      const items = await this.collectSubtreePostOrder(account);
      this.cascadeDeleteTarget = account;
      this.cascadeDeleteItems = items;
      this.cascadeConfirmInput = '';
    },
    closeCascadeDelete() {
      if (this.cascadeDeleting) {
        return;
      }
      this.cascadeDeleteTarget = null;
      this.cascadeDeleteItems = [];
      this.cascadeConfirmInput = '';
    },
    /** Leaves first, then groups — safe delete order for unused subtrees. */
    async collectSubtreePostOrder(
      account: AccountItem
    ): Promise<AccountItem[]> {
      await this.fetchChildren(account);
      const result: AccountItem[] = [];
      for (const child of account.children ?? []) {
        result.push(...(await this.collectSubtreePostOrder(child)));
      }
      result.push(account);
      return result;
    },
    async confirmCascadeDelete() {
      if (!this.canConfirmCascadeDelete || !this.cascadeDeleteTarget) {
        return;
      }

      this.cascadeDeleting = true;
      const target = this.cascadeDeleteTarget;
      const wasGroup = !!target.isGroup;
      const wasCascade = this.cascadeDeleteItems.length > 1;
      const items = [...this.cascadeDeleteItems];
      const deleted: string[] = [];
      const failed: string[] = [];

      try {
        for (const item of items) {
          const label = this.accountDisplay(item);
          if (item.isGroup) {
            await this.fetchChildren(item, true);
            if (item.children?.length) {
              failed.push(
                t`${label}: still has child accounts that could not be deleted`
              );
              continue;
            }
          }

          try {
            const doc = await fyo.doc.getDoc(ModelNameEnum.Account, item.name);
            await doc.delete();
            deleted.push(label);
          } catch (e) {
            if (e instanceof Error && getDbError(e) === LinkValidationError) {
              failed.push(t`${label}: has transactions or other links`);
            } else if (e instanceof Error) {
              failed.push(t`${label}: ${e.message}`);
            } else {
              failed.push(t`${label}: delete failed`);
            }
          }
        }
      } finally {
        this.cascadeDeleting = false;
        this.closeCascadeDelete();
        await this.fetchAccounts();
        await this.setTotalDebitAndCredit();
      }

      if (
        deleted.includes(this.accountDisplay(target)) &&
        this.$route.query.name === target.name
      ) {
        this.$router.back();
      }

      const detail: string[] = [];
      if (deleted.length) {
        detail.push(t`Deleted ${deleted.length} account(s).`);
      }
      if (failed.length) {
        detail.push(t`${failed.length} account(s) could not be deleted:`);
        detail.push(...failed.slice(0, 12));
        if (failed.length > 12) {
          detail.push(t`…and ${failed.length - 12} more`);
        }
      }

      const successTitle =
        wasCascade || wasGroup ? t`Group Deleted` : t`Account Deleted`;

      await showDialog({
        type: failed.length ? 'warning' : 'success',
        title: failed.length
          ? t`Some Accounts Could Not Be Deleted`
          : successTitle,
        detail: detail.length ? detail : t`No accounts were deleted.`,
      });
    },
    async exportCsv() {
      await this.setTotalDebitAndCredit();

      const rows = (await fyo.db.getAll(ModelNameEnum.Account, {
        fields: [
          'name',
          'accountName',
          'parentAccount',
          'isGroup',
          'rootType',
          'accountType',
          'disabled',
        ],
        orderBy: 'accountName',
        order: 'asc',
      })) as {
        name: string;
        accountName?: string;
        parentAccount?: string | null;
        isGroup?: boolean;
        rootType?: string;
        accountType?: string;
        disabled?: boolean;
      }[];

      const nameById = getMapFromList(
        rows.map((r) => ({
          name: r.name,
          accountName: r.accountName,
        })),
        'name'
      ) as Record<string, { name: string; accountName?: string }>;

      const header = [
        t`Account Name`,
        t`Root Type`,
        t`Account Type`,
        t`Parent`,
        t`Is Group`,
        t`Disabled`,
        t`Balance`,
      ];

      const matrix: unknown[][] = [header];
      for (const row of rows) {
        const parent = row.parentAccount
          ? accountDisplayName(
              nameById[row.parentAccount] ?? { name: row.parentAccount }
            )
          : '';
        const balance = this.getBalance({
          name: row.name,
          rootType: row.rootType as AccountRootType,
        } as AccountItem);

        matrix.push([
          accountDisplayName(row),
          row.rootType ?? '',
          row.accountType ?? '',
          parent,
          row.isGroup ? t`Yes` : t`No`,
          row.disabled ? t`Yes` : t`No`,
          balance,
        ]);
      }

      const { canceled, filePath } = await getSavePath(
        'chart-of-accounts',
        'csv'
      );
      if (canceled || !filePath) {
        return;
      }

      await ipc.saveData(generateCSV(matrix), filePath);
      fyo.telemetry.log(Verb.Exported, ModelNameEnum.Account, {
        extension: 'csv',
      });
      showExportInFolder(t`Export Successful`, filePath);
    },
    removeAccount(
      name: string,
      account?: AccountItem,
      parentAccount?: AccountItem
    ) {
      if (account == null && parentAccount == null) {
        return;
      }

      if (account == null && parentAccount) {
        account = parentAccount.children.find((ch) => ch?.name === name);
      }

      if (account == null) {
        return;
      }

      const indices = account.location.slice(1).map((i) => Number(i));

      let i = Number(account.location[0]);
      let parent = this.accounts[i];
      let children = this.accounts[i].children;

      while (indices.length > 1) {
        i = indices.shift()!;

        parent = children[i];
        children = children[i].children;
      }

      i = indices[0];

      if (children[i].name !== name) {
        return;
      }

      parent.children = removeAtIndex(children, i);
    },
    async toggleChildren(account: AccountItem) {
      const hasChildren = await this.fetchChildren(account);
      if (!hasChildren) {
        return false;
      }

      account.expanded = !account.expanded;
      if (!account.expanded) {
        account.addingAccount = false;
        account.addingGroupAccount = false;
      }

      return true;
    },
    async fetchChildren(account: AccountItem, force = false) {
      if (account.children == null || force) {
        account.children = await this.getChildren(account.name);
      }

      return !!account?.children?.length;
    },
    async getChildren(parent: null | string = null): Promise<AccountItem[]> {
      const children = await fyo.db.getAll(ModelNameEnum.Account, {
        filters: {
          parentAccount: parent,
        },
        fields: [
          'name',
          'accountName',
          'parentAccount',
          'isGroup',
          'rootType',
          'accountType',
          'disabled',
        ],
        orderBy: 'accountName',
        order: 'asc',
      });

      return children.map((d) => {
        d.expanded = false;
        d.addingAccount = false;
        d.addingGroupAccount = false;

        return d as unknown as AccountItem;
      });
    },
    async addAccount(parentAccount: AccountItem, key: AccKey) {
      if (!parentAccount.expanded) {
        await this.fetchChildren(parentAccount);
        parentAccount.expanded = true;
      }
      // activate editing of type 'key' and deactivate other type
      let otherKey: AccKey =
        key === 'addingAccount' ? 'addingGroupAccount' : 'addingAccount';
      parentAccount[key] = true;
      parentAccount[otherKey] = false;

      await nextTick();
      let input = (this.$refs[parentAccount.name] as HTMLInputElement[])[0];
      input.focus();
    },
    cancelAddingAccount(parentAccount: AccountItem) {
      parentAccount.addingAccount = false;
      parentAccount.addingGroupAccount = false;
      this.newAccountName = '';
    },
    async createNewAccount(parentAccount: AccountItem, isGroup: boolean) {
      // freeze input
      this.insertingAccount = true;

      const accountName = this.newAccountName.trim();
      const doc = fyo.doc.getNewDoc('Account');
      try {
        let { name, rootType, accountType } = parentAccount;
        await doc.set({
          accountName,
          parentAccount: name,
          rootType,
          accountType,
          isGroup,
        });
        await doc.sync();

        // turn off editing
        parentAccount.addingAccount = false;
        parentAccount.addingGroupAccount = false;

        // update accounts
        await this.fetchChildren(parentAccount, true);

        // open quick edit
        await openQuickEdit({ doc });
        this.setOpenAccountDocListener(doc, undefined, parentAccount);

        // unfreeze input
        this.insertingAccount = false;
        this.newAccountName = '';
      } catch (e) {
        // unfreeze input
        this.insertingAccount = false;
        await handleErrorWithDialog(e, doc);
      }
    },
    isQuickEditOpen(account: AccountItem) {
      let { edit, schemaName, name } = this.$route.query;
      return !!(edit && schemaName === 'Account' && name === account.name);
    },
    getIconComponent(isGroup: boolean, name?: string): Component {
      let lightColor = this.darkMode ? uicolors.gray[600] : uicolors.gray[400];
      let darkColor = this.darkMode ? uicolors.gray[400] : uicolors.gray[700];
      let icons = {
        'Application of Funds (Assets)': `<svg class="w-4 h-4" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
            <g fill="none" fill-rule="evenodd">
              <path d="M15.333 5.333H.667A.667.667 0 000 6v9.333c0 .368.299.667.667.667h14.666a.667.667 0 00.667-.667V6a.667.667 0 00-.667-.667zM8 12.667a2 2 0 110-4 2 2 0 010 4z" fill="${darkColor}" fill-rule="nonzero"/>
              <path d="M14 2.667V4H2V2.667h12zM11.333 0v1.333H4.667V0h6.666z" fill="${lightColor}"/>
            </g>
          </svg>`,
        Expenses: `<svg class="w-4 h-4" viewBox="0 0 14 16" xmlns="http://www.w3.org/2000/svg">
            <path d="M13.668 0v15.333a.666.666 0 01-.666.667h-12a.666.666 0 01-.667-.667V0l2.667 2 2-2 2 2 2-2 2 2 2.666-2zM9.964 4.273H4.386l-.311 1.133h1.62c.933 0 1.474.362 1.67.963H4.373l-.298 1.053h3.324c-.175.673-.767 1.044-1.705 1.044H4.182l.008.83L7.241 13h1.556v-.072L6.01 9.514c1.751-.106 2.574-.942 2.748-2.092h.904l.298-1.053H8.75a2.375 2.375 0 00-.43-1.044l1.342.009.302-1.061z" fill="${darkColor}" fill-rule="evenodd"/>
          </svg>`,
        Income: `<svg class="w-4 h-4" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
            <g fill="none" fill-rule="evenodd">
              <path d="M16 12.859V14c0 1.105-2.09 2-4.667 2-2.494 0-4.531-.839-4.66-1.894L6.667 14v-1.141C7.73 13.574 9.366 14 11.333 14c1.968 0 3.602-.426 4.667-1.141zm0-3.334v1.142c0 1.104-2.09 2-4.667 2-2.494 0-4.531-.839-4.66-1.894l-.006-.106V9.525c1.064.716 2.699 1.142 4.666 1.142 1.968 0 3.602-.426 4.667-1.142zm-4.667-4.192c2.578 0 4.667.896 4.667 2 0 1.105-2.09 2-4.667 2s-4.666-.895-4.666-2c0-1.104 2.089-2 4.666-2z" fill="${darkColor}"/>
              <path d="M0 10.859C1.065 11.574 2.7 12 4.667 12l.337-.005.33-.013v1.995c-.219.014-.44.023-.667.023-2.495 0-4.532-.839-4.66-1.894L0 12v-1.141zm0-2.192V7.525c1.065.716 2.7 1.142 4.667 1.142l.337-.005.33-.013v1.995c-.219.013-.44.023-.667.023-2.495 0-4.532-.839-4.66-1.894L0 8.667V7.525zm0-4.475c1.065.715 2.7 1.141 4.667 1.141.694 0 1.345-.056 1.946-.156-.806.56-1.27 1.292-1.278 2.134-.219.013-.441.022-.668.022-2.578 0-4.667-.895-4.667-2zM4.667 0c2.577 0 4.666.895 4.666 2S7.244 4 4.667 4C2.089 4 0 3.105 0 2s2.09-2 4.667-2z" fill="${lightColor}"/>
            </g>
          </svg>`,
        'Source of Funds (Liabilities)': `<svg class="w-4 h-4" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
            <g fill="none" fill-rule="evenodd">
              <path d="M7.332 11.36l4.666-3.734 2 1.6V.666A.667.667 0 0013.332 0h-12a.667.667 0 00-.667.667v14.666c0 .369.298.667.667.667h6v-4.64zm-4-7.36H11.3v1.333H3.332V4zm2.666 8H3.332v-1.333h2.666V12zM3.332 8.667V7.333h5.333v1.334H3.332z" fill="${darkColor}"/>
              <path d="M15.332 12l-3.334-2.667L8.665 12v3.333c0 .369.298.667.667.667h2v-2h1.333v2h2a.667.667 0 00.667-.667V12z" fill="${lightColor}"/>
            </g>
          </svg>`,
      };

      let leaf = `<svg class="w-2 h-2" viewBox="0 0 8 8" xmlns="http://www.w3.org/2000/svg">
        <circle stroke="${darkColor}" cx="4" cy="4" r="3.5" fill="none" fill-rule="evenodd"/>
      </svg>`;

      let folder = `<svg class="w-3 h-3" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
        <path d="M8.333 3.367L6.333.7H.667A.667.667 0 000 1.367v12a2 2 0 002 2h12a2 2 0 002-2V4.033a.667.667 0 00-.667-.666h-7z" fill="${darkColor}" fill-rule="evenodd"/>
      </svg>`;

      let icon = isGroup ? folder : leaf;

      return {
        template: icons[name as keyof typeof icons] || icon,
      };
    },
    getItemStyle(level: number) {
      const styles: Record<string, string> = {
        height: 'calc(var(--h-row-mid) + 1px)',
      };
      if (this.languageDirection === 'rtl') {
        styles['padding-right'] = `calc(1rem + 2rem * ${level})`;
      } else {
        styles['padding-left'] = `calc(1rem + 2rem * ${level})`;
      }
      return styles;
    },
    getGroupStyle(level: number) {
      const styles: Record<string, string> = {
        height: 'height: calc(var(--h-row-mid) + 1px)',
      };
      if (this.languageDirection === 'rtl') {
        styles['padding-right'] = `calc(1rem + 2rem * ${level})`;
      } else {
        styles['padding-left'] = `calc(1rem + 2rem * ${level})`;
      }
      return styles;
    },
  },
});
</script>
