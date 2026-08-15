<template>
  <FormContainer :use-full-width="useFullWidth">
    <template v-if="hasDoc" #header-left>
      <Barcode
        v-if="canShowBarcode"
        class="h-8"
        @item-selected="(name:string) => {
          // @ts-ignore
          doc?.addItem(name);
        }"
      />
      <ExchangeRate
        v-if="canShowExchangeRate"
        :disabled="doc?.isSubmitted || doc?.isCancelled"
        :from-currency="fromCurrency"
        :to-currency="toCurrency"
        :exchange-rate="exchangeRate"
        @change="
          async (exchangeRate: number) =>
            await doc.set('exchangeRate', exchangeRate)
        "
      />
      <p
        v-if="schema.label && !(canShowBarcode || canShowExchangeRate)"
        class="
          text-xl
          font-semibold
          items-center
          text-gray-600
          dark:text-gray-100
        "
      >
        {{ formTitle }}
      </p>
    </template>
    <template v-if="hasDoc" #header>
      <Button
        v-if="canShowLinks"
        :icon="true"
        :title="t`View linked entries`"
        @click="showLinks = true"
      >
        <feather-icon name="link" class="w-4 h-4"></feather-icon>
      </Button>
      <Button
        v-if="canPrint"
        ref="printButton"
        :icon="true"
        :title="t`Open Print View`"
        @click="routeTo(`/print/${doc.schemaName}/${doc.name}`)"
      >
        <feather-icon name="printer" class="w-4 h-4"></feather-icon>
      </Button>
      <DropdownWithActions
        v-if="printCheckAction"
        :actions="printCheckDropdownActions"
        :force-dropdown="true"
        :icon="false"
        type="secondary"
      >
        {{ printCheckLabel }}
      </DropdownWithActions>
      <DropdownWithActions
        v-for="group of groupedActions"
        :key="group.group || 'more'"
        :type="group.type"
        :actions="group.actions"
        :force-dropdown="!group.group"
      >
        <p v-if="group.group">
          {{ group.group }}
        </p>
        <feather-icon v-else name="more-horizontal" class="w-4 h-4" />
      </DropdownWithActions>
      <Button v-if="doc?.canSubmit" type="primary" @click="submit">{{
        t`Submit`
      }}</Button>
      <Button v-else-if="showSaveButton" type="primary" @click="sync">
        {{ t`Save` }}
      </Button>
    </template>
    <template #body>
      <FormHeader
        :form-title="title"
        class="
          sticky
          top-0
          bg-white
          dark:bg-gray-890
          border-b
          dark:border-gray-800
        "
      >
        <StatusPill v-if="hasDoc" :doc="doc" />
      </FormHeader>

      <!-- Provenance for rows copied from the QBD Archive -->
      <div
        v-if="hasDoc && archiveSourceId"
        class="
          flex
          items-center
          gap-2
          px-4
          py-1.5
          text-xs
          bg-yellow-50
          dark:bg-gray-875
          text-gray-700
          dark:text-gray-200
          border-b
          dark:border-gray-800
        "
      >
        <span>{{ t`Copied from QuickBooks archive` }}</span>
        <button
          class="underline text-blue-600 dark:text-blue-400"
          @click="openArchiveSource"
        >
          {{ t`View archive document` }}
        </button>
      </div>

      <SmartFillBox
        v-if="isParty && hasDoc && !isWorkforceParty"
        :doc="doc"
        @change="updateGroupedFields"
      />

      <!-- Section Container -->
      <div
        v-if="hasDoc"
        class="overflow-auto custom-scroll custom-scroll-thumb1"
      >
        <CommonFormSection
          v-for="([n, fields], idx) in activeGroup.entries()"
          :key="n + idx"
          ref="section"
          class="p-4"
          :class="
            idx !== 0 && activeGroup.size > 1
              ? 'border-t dark:border-gray-800'
              : ''
          "
          :show-title="activeGroup.size > 1 && n !== t`Default`"
          :title="n"
          :fields="fields"
          :doc="doc"
          :errors="errors"
          @editrow="(doc: Doc) => showRowEditForm(doc)"
          @value-change="onValueChange"
          @row-change="updateGroupedFields"
        />
        <EmployeePaySection
          v-if="isWorkforceParty"
          ref="paySection"
          class="p-4 border-t dark:border-gray-800"
          :party-doc="doc"
        />
      </div>

      <!-- Tab Bar -->
      <div
        v-if="groupedFields && groupedFields.size > 1"
        class="
          mt-auto
          px-4
          pb-4
          flex
          gap-8
          border-t
          dark:border-gray-800
          flex-shrink-0
          sticky
          bottom-0
          bg-white
          dark:bg-gray-875
        "
      >
        <div
          v-for="key of groupedFields.keys()"
          :key="key"
          class="text-sm cursor-pointer"
          :class="
            key === activeTab
              ? 'text-gray-900 dark:text-gray-25 font-semibold border-t-2 border-gray-800 dark:border-gray-100'
              : 'text-gray-700 dark:text-gray-100 '
          "
          :style="{
            paddingTop: key === activeTab ? 'calc(1rem - 2px)' : '1rem',
          }"
          @click="activeTab = key"
        >
          {{ key }}
        </div>
      </div>
    </template>
    <template #quickedit>
      <Transition name="quickedit">
        <SideDrawerShell v-if="showLinks && canShowLinks">
          <LinkedEntries :doc="doc" @close="showLinks = false" />
        </SideDrawerShell>
      </Transition>
      <Transition name="quickedit">
        <SideDrawerShell v-if="row && !showLinks">
          <RowEditForm
            :doc="doc"
            :fieldname="row.fieldname"
            :index="row.index"
            @previous="(i:number) => row!.index = i"
            @next="(i:number) => row!.index = i"
            @close="() => (row = null)"
          />
        </SideDrawerShell>
      </Transition>
    </template>
  </FormContainer>
</template>
<script lang="ts">
import { DocValue } from 'fyo/core/types';
import { Doc } from 'fyo/model/doc';
import { Action } from 'fyo/model/types';
import { DEFAULT_CURRENCY } from 'fyo/utils/consts';
import { ValidationError } from 'fyo/utils/errors';
import { getDocStatus } from 'models/helpers';
import { isWorkforcePartyRole, PartyRole } from 'models/baseModels/Party/types';
import { ModelNameEnum } from 'models/types';
import { Field, Schema } from 'schemas/types';
import Button from 'src/components/Button.vue';
import Barcode from 'src/components/Controls/Barcode.vue';
import ExchangeRate from 'src/components/Controls/ExchangeRate.vue';
import DropdownWithActions from 'src/components/DropdownWithActions.vue';
import FormContainer from 'src/components/FormContainer.vue';
import SideDrawerShell from 'src/components/SideDrawerShell.vue';
import FormHeader from 'src/components/FormHeader.vue';
import StatusPill from 'src/components/StatusPill.vue';
import SmartFillBox from 'src/components/SmartFillBox.vue';
import { getErrorMessage } from 'src/utils';
import { shortcutsKey } from 'src/utils/injectionKeys';
import { docsPathMap } from 'src/utils/misc';
import { docsPathRef } from 'src/utils/refs';
import { ActionGroup, DocRef, UIGroupedFields } from 'src/utils/types';
import {
  commonDocSubmit,
  commonDocSync,
  getDocFromNameIfExistsElseNew,
  getDocReferenceLabel,
  getFieldsGroupedByTabAndSection,
  getFormRoute,
  getActionsForDoc,
  getGroupedActionsForDoc,
  isPrintable,
  routeReplace,
  routeTo,
} from 'src/utils/ui';
import { useDocShortcuts } from 'src/utils/vueUtils';
import { computed, defineComponent, inject, nextTick, ref } from 'vue';
import CommonFormSection from './CommonFormSection.vue';
import EmployeePaySection from './EmployeePaySection.vue';
import LinkedEntries from './LinkedEntries.vue';
import RowEditForm from './RowEditForm.vue';

export default defineComponent({
  components: {
    FormContainer,
    FormHeader,
    CommonFormSection,
    EmployeePaySection,
    Button,
    DropdownWithActions,
    Barcode,
    ExchangeRate,
    LinkedEntries,
    RowEditForm,
    SideDrawerShell,
    StatusPill,
    SmartFillBox,
  },
  provide() {
    return {
      doc: computed(() => this.docOrNull),
    };
  },
  props: {
    name: { type: String, default: '' },
    schemaName: { type: String, default: ModelNameEnum.SalesInvoice },
    paneId: { type: String, default: '' },
  },
  setup() {
    const shortcuts = inject(shortcutsKey);
    const docOrNull = ref(null) as DocRef;
    let context = 'CommonForm';
    if (shortcuts) {
      context = useDocShortcuts(shortcuts, docOrNull, 'CommonForm', true);
    }

    return {
      docOrNull,
      shortcuts,
      context,
      printButton: ref<InstanceType<typeof Button> | null>(null),
    };
  },
  data() {
    return {
      errors: {},
      activeTab: this.t`Default`,
      groupedFields: null,
      isPrintable: false,
      showLinks: false,
      useFullWidth: false,
      row: null,
    } as {
      errors: Record<string, string>;
      activeTab: string;
      groupedFields: null | UIGroupedFields;
      isPrintable: boolean;
      showLinks: boolean;
      useFullWidth: boolean;
      row: null | { index: number; fieldname: string };
    };
  },
  computed: {
    formTitle(): string {
      const label = this.schema?.label ?? '';
      if (this.schemaName !== 'Party' || !this.hasDoc) {
        return label;
      }
      const role = this.doc.role as string | undefined;
      if (role === 'Employee' || role === 'Contractor') {
        return this.t`Employee`;
      }
      if (role === 'Customer') {
        return this.t`Customer`;
      }
      if (role === 'Supplier') {
        return this.t`Supplier`;
      }
      return label;
    },
    showSaveButton(): boolean {
      if (!this.hasDoc) {
        return false;
      }
      if (this.doc.schema.isChild) {
        return false;
      }
      if (this.doc.isCancelled) {
        return false;
      }
      if (this.doc.schema.isSubmittable && this.doc.isSubmitted) {
        return false;
      }
      return true;
    },
    canShowBarcode(): boolean {
      if (!this.fyo.singles.InventorySettings?.enableBarcodes) {
        return false;
      }

      if (!this.hasDoc) {
        return false;
      }

      if (this.doc.isSubmitted || this.doc.isCancelled) {
        return false;
      }

      // @ts-ignore
      return typeof this.doc?.addItem === 'function';
    },
    canShowExchangeRate(): boolean {
      return this.hasDoc && !!this.doc.isMultiCurrency;
    },
    exchangeRate(): number {
      if (!this.hasDoc || typeof this.doc.exchangeRate !== 'number') {
        return 1;
      }

      return this.doc.exchangeRate;
    },
    fromCurrency(): string {
      const currency = this.doc?.currency;
      if (typeof currency !== 'string') {
        return this.toCurrency;
      }

      return currency;
    },
    toCurrency(): string {
      const currency = this.fyo.singles.SystemSettings?.currency;
      if (typeof currency !== 'string') {
        return DEFAULT_CURRENCY;
      }

      return currency;
    },
    canPrint(): boolean {
      if (!this.hasDoc) {
        return false;
      }

      return !this.doc.isCancelled && !this.doc.dirty && this.isPrintable;
    },
    canShowLinks(): boolean {
      if (!this.hasDoc) {
        return false;
      }

      if (this.doc.schema.isSubmittable && !this.doc.isSubmitted) {
        return false;
      }

      return this.doc.inserted;
    },
    hasDoc(): boolean {
      return this.docOrNull instanceof Doc;
    },
    archiveSourceId(): string {
      if (!this.hasDoc) {
        return '';
      }
      const sourceId = this.doc.get('sourceId');
      return typeof sourceId === 'string' ? sourceId : '';
    },
    isParty(): boolean {
      return this.schemaName === ModelNameEnum.Party;
    },
    isWorkforceParty(): boolean {
      if (!this.isParty || !this.hasDoc) {
        return false;
      }
      return isWorkforcePartyRole(this.doc.role as PartyRole);
    },
    status(): string {
      if (!this.hasDoc) {
        return '';
      }

      return getDocStatus(this.doc);
    },
    doc(): Doc {
      const doc = this.docOrNull;
      if (!doc) {
        throw new ValidationError(
          this.t`Doc ${this.schema.label} ${this.name} not set`
        );
      }
      return doc;
    },
    title(): string {
      if (!this.docOrNull || this.docOrNull.notInserted) {
        if (this.docOrNull) {
          const titleField =
            this.schema.linkDisplayField || this.schema.titleField || 'name';
          if (titleField !== 'name') {
            const title = this.docOrNull.get(titleField);
            if (typeof title === 'string' && title.trim()) {
              return title.trim();
            }
          }
          if (this.isWorkforceParty) {
            return this.t`New Employee`;
          }
        }
        return this.t`New Entry`;
      }

      return getDocReferenceLabel(this.docOrNull);
    },

    schema(): Schema {
      const schema = this.fyo.schemaMap[this.schemaName];
      if (!schema) {
        throw new ValidationError(`no schema found with ${this.schemaName}`);
      }

      return schema;
    },
    activeGroup(): Map<string, Field[]> {
      if (!this.groupedFields) {
        return new Map();
      }

      const group = this.groupedFields.get(this.activeTab);
      if (!group) {
        const tab = [...this.groupedFields.keys()][0];
        return this.groupedFields.get(tab) ?? new Map<string, Field[]>();
      }

      return group;
    },
    printCheckAction(): Action | null {
      if (!this.hasDoc) {
        return null;
      }
      const label = this.t`Print Check`;
      return getActionsForDoc(this.doc).find((a) => a.label === label) ?? null;
    },
    printCheckAlreadyNumbered(): boolean {
      if (!this.hasDoc || this.doc.schemaName !== 'Payment') {
        return false;
      }
      const payment = this.doc as {
        referenceId?: string;
        printLater?: boolean;
      };
      return !!(payment.referenceId as string)?.trim() && !payment.printLater;
    },
    printCheckLabel(): string {
      return this.printCheckAlreadyNumbered
        ? this.t`Reprint Check`
        : this.t`Print Check`;
    },
    printCheckDropdownActions(): Action[] {
      if (!this.printCheckAction) {
        return [];
      }
      const printGroup = this.t`Print`;
      const formats: {
        value: 'voucher' | 'threePerPage' | 'ledgerStub';
        label: string;
      }[] = [
        {
          value: 'voucher',
          label: this.t`Print as Voucher (1 per page)`,
        },
        {
          value: 'threePerPage',
          label: this.t`Print as 3 per page`,
        },
        {
          value: 'ledgerStub',
          label: this.t`Print as Ledger / stub`,
        },
      ];
      return [
        ...formats.map(({ value, label }) => ({
          label,
          group: printGroup,
          action: async () => {
            await this.printCheckWithFormat(value);
          },
        })),
        {
          label: this.t`Check Printing settings`,
          group: this.t`Settings`,
          action: async () => {
            const { openSettings } = await import('src/utils/ui');
            await openSettings('CheckPrinting');
          },
        },
      ];
    },
    groupedActions(): ActionGroup[] {
      if (!this.hasDoc) {
        return [];
      }

      const groups = getGroupedActionsForDoc(this.doc).map((g) => ({
        ...g,
        actions: [...g.actions],
      }));

      // Print Check is shown as its own toolbar button — drop from menus.
      const printLabel = this.t`Print Check`;
      for (const g of groups) {
        g.actions = g.actions.filter((a) => a.label !== printLabel);
      }

      const fullSizeAction = {
        label: this.useFullWidth ? this.t`Exit full size` : this.t`Full size`,
        action: async () => {
          await this.toggleWidth();
        },
      };

      let more = groups.find((g) => !g.group);
      if (!more) {
        more = {
          group: '',
          label: '',
          type: 'secondary',
          actions: [],
        };
        groups.push(more);
      }
      more.actions.push(fullSizeAction);

      return groups.filter((g) => g.actions.length > 0);
    },
  },
  beforeMount() {
    this.useFullWidth = !!this.fyo.singles.Misc?.useFullWidth;
  },
  async mounted() {
    if (this.fyo.store.isDevelopment) {
      // @ts-ignore
      window.cf = this;
    }

    await this.setDoc();
    this.replacePathAfterSync();
    this.bindMemorizedListRedirect();
    this.updateGroupedFields();
    if (this.groupedFields) {
      this.activeTab = [...this.groupedFields.keys()][0];
    }
    this.isPrintable = await isPrintable(this.schemaName);
    this.setFormViewShortcuts();
  },
  activated(): void {
    this.useFullWidth = !!this.fyo.singles.Misc?.useFullWidth;
    docsPathRef.value = docsPathMap[this.schemaName] ?? '';
    this.bindMemorizedListRedirect();
    this.setFormViewShortcuts();
  },
  deactivated(): void {
    this.unbindMemorizedListRedirect();
    docsPathRef.value = '';
    this.showLinks = false;
    this.row = null;
  },
  methods: {
    routeTo,
    openArchiveSource() {
      if (!this.archiveSourceId) {
        return;
      }
      void routeTo(
        `/source-books/doc/qb/${encodeURIComponent(this.archiveSourceId)}`
      );
    },
    setFormViewShortcuts() {
      // Shortcuts here register after awaits in mounted(), i.e. outside the
      // pane-ownership window — associate explicitly or a side-pane form's
      // shortcuts get treated as main-owned (and can steal Cmd+P/Cmd+S).
      if (this.paneId) {
        this.shortcuts?.associatePaneContext(this.paneId, this.context);
      }
      this.shortcuts?.pmod.set(this.context, ['KeyP'], () => {
        if (!this.canPrint) {
          return;
        }

        this.printButton?.$el.click();
      });
      this.shortcuts?.pmod.set(this.context, ['KeyL'], () => {
        if (!this.canShowLinks && !this.showLinks) {
          return;
        }

        this.showLinks = !this.showLinks;
      });
    },
    bindMemorizedListRedirect() {
      if (
        this.schemaName !== ModelNameEnum.MemorizedTransaction ||
        !this.hasDoc
      ) {
        return;
      }
      // Stable listener so on/off share one reference (and satisfy unbound-method).
      const handler: () => unknown = () => this.redirectMemorizedToList();
      const prev = this._redirectMemorizedAfterSync as
        | (() => unknown)
        | undefined;
      if (prev) {
        this.doc.off('afterSync', prev);
      }
      this._redirectMemorizedAfterSync = handler;
      this.doc.on('afterSync', handler);
    },
    unbindMemorizedListRedirect() {
      if (
        this.schemaName !== ModelNameEnum.MemorizedTransaction ||
        !this.hasDoc
      ) {
        return;
      }
      const prev = this._redirectMemorizedAfterSync as
        | (() => unknown)
        | undefined;
      if (!prev) {
        return;
      }
      this.doc.off('afterSync', prev);
      this._redirectMemorizedAfterSync = undefined;
    },
    async redirectMemorizedToList() {
      await routeTo(`/list/${ModelNameEnum.MemorizedTransaction}`);
    },
    async printCheckWithFormat(
      format: 'voucher' | 'threePerPage' | 'ledgerStub'
    ) {
      if (!this.hasDoc || this.doc.schemaName !== 'Payment') {
        return;
      }
      const { printPaymentAsCheck } = await import(
        'src/utils/checkPrint/printChecks'
      );
      await printPaymentAsCheck(this.fyo, this.doc as never, format);
    },
    async toggleWidth() {
      const value = !this.useFullWidth;
      await this.fyo.singles.Misc?.setAndSync('useFullWidth', value);
      this.useFullWidth = value;
    },
    updateGroupedFields(): void {
      if (!this.hasDoc) {
        return;
      }

      this.groupedFields = getFieldsGroupedByTabAndSection(
        this.schema,
        this.doc
      );
    },
    async sync(useDialog?: boolean) {
      // Pay validates/saves via EmployeePaySection Party beforeSync/afterSync
      // hooks (also covers keyboard shortcuts that call doc.sync directly).
      if (!(await commonDocSync(this.doc, useDialog))) {
        return;
      }

      this.updateGroupedFields();
    },
    async submit() {
      if (await commonDocSubmit(this.doc)) {
        this.updateGroupedFields();
      }
    },
    async setDoc() {
      if (this.hasDoc) {
        return;
      }

      this.docOrNull = await getDocFromNameIfExistsElseNew(
        this.schemaName,
        this.name
      );
    },
    replacePathAfterSync() {
      // Recurring templates return to the list after save instead.
      if (this.schemaName === ModelNameEnum.MemorizedTransaction) {
        return;
      }
      if (!this.hasDoc || this.doc.inserted) {
        return;
      }

      this.doc.once('afterSync', async () => {
        const route = getFormRoute(this.schemaName, this.doc.name!);
        await routeReplace(route);
      });
    },
    async showRowEditForm(doc: Doc) {
      if (this.showLinks) {
        this.showLinks = false;
        await nextTick();
      }

      const index = doc.idx;
      const fieldname = doc.parentFieldname;

      if (typeof index === 'number' && typeof fieldname === 'string') {
        this.row = { index, fieldname };
      }
    },
    async onValueChange(field: Field, value: DocValue) {
      const { fieldname } = field;
      delete this.errors[fieldname];

      try {
        await this.doc.set(fieldname, value);
      } catch (err) {
        if (!(err instanceof Error)) {
          return;
        }

        this.errors[fieldname] = getErrorMessage(err, this.doc);
      }

      this.updateGroupedFields();
    },
  },
});
</script>
