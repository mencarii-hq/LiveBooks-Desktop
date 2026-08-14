<template>
  <FormContainer>
    <template #header>
      <Button type="primary" @click="sync">
        {{ t`Save` }}
      </Button>
    </template>
    <template #body>
      <FormHeader
        :form-title="tabLabels[activeTab] ?? ''"
        :form-sub-title="t`Settings`"
        class="
          sticky
          top-0
          bg-white
          dark:bg-gray-890
          border-b
          dark:border-gray-800
        "
      >
      </FormHeader>

      <!-- Section Container -->
      <div v-if="doc" class="overflow-auto custom-scroll custom-scroll-thumb1">
        <CommonFormSection
          v-for="([name, fields], idx) in activeGroup.entries()"
          :key="name + idx"
          ref="section"
          class="p-4"
          :class="
            idx !== 0 && activeGroup.size > 1
              ? 'border-t dark:border-gray-800'
              : ''
          "
          :show-title="activeGroup.size > 1 && name !== t`Default`"
          :title="name"
          :fields="fields"
          :doc="doc"
          :get-doc-for-field="getDocForField"
          :errors="errors"
          @value-change="onValueChange"
        />

        <!-- System tab: LiveBooks Desktop version -->
        <div
          v-if="activeTab === 'SystemSettings'"
          class="p-4 border-t dark:border-gray-800"
        >
          <h2
            class="text-base text-gray-900 dark:text-gray-25 font-semibold mb-4"
          >
            {{ t`Display Zoom` }}
          </h2>
          <div class="flex items-end justify-between gap-4">
            <div class="flex-1 max-w-md">
              <div class="text-gray-600 dark:text-gray-500 text-sm mb-1">
                {{ t`Adjust interface size in 5% steps (50%–200%)` }}
              </div>
              <input
                type="text"
                readonly
                tabindex="-1"
                class="
                  w-full
                  text-base text-gray-900
                  dark:text-gray-25
                  border border-transparent
                  rounded
                  px-2
                  py-1.5
                  bg-gray-25
                  dark:bg-gray-850
                "
                :value="zoomPercentLabel"
              />
            </div>
            <div class="flex items-center gap-2 shrink-0 mb-0.5">
              <Button
                :disabled="!canZoomOut"
                :title="t`Zoom out 5%`"
                @click="zoomOut"
              >
                {{ t`Zoom out` }}
              </Button>
              <Button
                :disabled="!canZoomIn"
                :title="t`Zoom in 5%`"
                @click="zoomIn"
              >
                {{ t`Zoom in` }}
              </Button>
            </div>
          </div>
        </div>

        <div
          v-if="activeTab === 'SystemSettings'"
          class="p-4 border-t dark:border-gray-800"
        >
          <h2
            class="text-base text-gray-900 dark:text-gray-25 font-semibold mb-4"
          >
            {{ t`LiveBooks Desktop Version` }}
          </h2>
          <div class="flex items-end justify-between gap-4">
            <div class="flex-1 max-w-md">
              <div class="text-gray-600 dark:text-gray-500 text-sm mb-1">
                {{ desktopPlatformLabel }}
              </div>
              <input
                type="text"
                readonly
                tabindex="-1"
                class="
                  w-full
                  text-base text-gray-900
                  dark:text-gray-25
                  border border-transparent
                  rounded
                  px-2
                  py-1.5
                  bg-gray-25
                  dark:bg-gray-850
                "
                :value="appVersion"
              />
            </div>
            <Button class="shrink-0 mb-0.5" @click="checkForUpdates">
              {{ t`Check for updates` }}
            </Button>
          </div>
        </div>
      </div>

      <!-- Check Printing tab (custom calibration UI, not schema-driven) -->
      <div
        v-if="activeTab === checkPrintingTab"
        class="overflow-auto custom-scroll custom-scroll-thumb1"
      >
        <CheckPrintSettings ref="checkPrintSettings" />
      </div>

      <!-- Tab Bar -->
      <div
        v-if="settingsTabKeys.length > 1"
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
          dark:bg-gray-890
        "
      >
        <div
          v-for="key of settingsTabKeys"
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
          {{ tabLabels[key] }}
        </div>
      </div>
    </template>
  </FormContainer>
</template>
<script lang="ts">
import { DocValue } from 'fyo/core/types';
import { Doc } from 'fyo/model/doc';
import { ValidationError } from 'fyo/utils/errors';
import { ModelNameEnum } from 'models/types';
import { Field, Schema } from 'schemas/types';
import Button from 'src/components/Button.vue';
import FormContainer from 'src/components/FormContainer.vue';
import FormHeader from 'src/components/FormHeader.vue';
import { handleErrorWithDialog } from 'src/errorHandling';
import { getErrorMessage } from 'src/utils';
import { evaluateHidden } from 'src/utils/doc';
import { shortcutsKey } from 'src/utils/injectionKeys';
import { showDialog, showToast } from 'src/utils/interactive';
import { docsPathMap } from 'src/utils/misc';
import { docsPathRef } from 'src/utils/refs';
import { UIGroupedFields } from 'src/utils/types';
import {
  DISPLAY_ZOOM_MAX,
  DISPLAY_ZOOM_MIN,
  getDisplayZoomFactor,
  zoomDisplayIn,
  zoomDisplayOut,
} from 'src/utils/ui';
import { computed, defineComponent, inject } from 'vue';
import CommonFormSection from '../CommonForm/CommonFormSection.vue';
import CheckPrintSettings from './CheckPrintSettings.vue';

const COMPONENT_NAME = 'Settings';
const CHECK_PRINTING_TAB = 'CheckPrinting';

export default defineComponent({
  components: {
    FormContainer,
    Button,
    FormHeader,
    CommonFormSection,
    CheckPrintSettings,
  },
  provide() {
    return { doc: computed(() => this.doc) };
  },
  props: {
    tab: { type: String, default: '' },
  },
  setup() {
    return {
      shortcuts: inject(shortcutsKey),
    };
  },
  data() {
    return {
      errors: {},
      activeTab: ModelNameEnum.AccountingSettings,
      groupedFields: null,
      zoomFactor: 1,
      _zoomSyncTimer: null as number | null,
    } as {
      errors: Record<string, string>;
      activeTab: string;
      groupedFields: null | UIGroupedFields;
      zoomFactor: number;
      _zoomSyncTimer: number | null;
    };
  },
  computed: {
    canSave() {
      return [
        ModelNameEnum.AccountingSettings,
        ModelNameEnum.InventorySettings,
        ModelNameEnum.Defaults,
        ModelNameEnum.POSSettings,
        ModelNameEnum.PrintSettings,
        ModelNameEnum.SystemSettings,
      ].some((s) => this.fyo.singles[s]?.canSave);
    },
    doc(): Doc | null {
      const doc = this.fyo.singles[this.activeTab];
      if (!doc) {
        return null;
      }

      return doc;
    },
    checkPrintingTab(): string {
      return CHECK_PRINTING_TAB;
    },
    tabLabels(): Record<string, string> {
      return {
        [ModelNameEnum.AccountingSettings]: this.t`General`,
        [ModelNameEnum.PrintSettings]: this.t`Print`,
        [ModelNameEnum.InventorySettings]: this.t`Inventory`,
        [ModelNameEnum.Defaults]: this.t`Defaults`,
        [ModelNameEnum.POSSettings]: this.t`POS Settings`,
        [ModelNameEnum.SystemSettings]: this.t`System`,
        [CHECK_PRINTING_TAB]: this.t`Check Printing`,
      };
    },
    schemas(): Schema[] {
      const enableInventory =
        !!this.fyo.singles.AccountingSettings?.enableInventory;
      const enablePOS = !!this.fyo.singles.InventorySettings?.enablePointOfSale;

      return [
        ModelNameEnum.AccountingSettings,
        ModelNameEnum.InventorySettings,
        ModelNameEnum.Defaults,
        ModelNameEnum.POSSettings,
        ModelNameEnum.PrintSettings,
        ModelNameEnum.SystemSettings,
      ]
        .filter((s) => {
          if (s === ModelNameEnum.InventorySettings && !enableInventory) {
            return false;
          }

          if (s === ModelNameEnum.POSSettings && !enablePOS) {
            return false;
          }

          return true;
        })
        .map((s) => this.fyo.schemaMap[s]!);
    },
    settingsTabKeys(): string[] {
      const base = this.groupedFields
        ? [...this.groupedFields.keys()]
        : [ModelNameEnum.AccountingSettings as string];
      const keys = [...base];
      const printIdx = keys.indexOf(ModelNameEnum.PrintSettings);
      const insertAt =
        printIdx >= 0
          ? printIdx + 1
          : Math.max(0, keys.indexOf(ModelNameEnum.SystemSettings));
      keys.splice(insertAt, 0, CHECK_PRINTING_TAB);
      return keys;
    },
    appVersion(): string {
      return this.fyo.store.appVersion || '0.0.0';
    },
    desktopPlatformLabel(): string {
      const platform = this.fyo.store.platform;
      const arch = this.fyo.store.arch || '';
      if (platform === 'darwin') {
        return arch === 'arm64' ? 'Mac Silicon' : 'Mac Intel';
      }
      if (platform === 'win32') {
        return 'Windows';
      }
      if (platform === 'linux') {
        return 'Linux';
      }
      return this.platform || 'Desktop';
    },
    canZoomOut(): boolean {
      return this.zoomFactor > DISPLAY_ZOOM_MIN + 1e-6;
    },
    canZoomIn(): boolean {
      return this.zoomFactor < DISPLAY_ZOOM_MAX - 1e-6;
    },
    zoomPercentLabel(): string {
      return `${Math.round(this.zoomFactor * 100)}%`;
    },
    activeGroup(): Map<string, Field[]> {
      if (!this.groupedFields) {
        return new Map();
      }

      // Check Printing is a custom tab (not schema-driven).
      if (this.activeTab === CHECK_PRINTING_TAB) {
        return new Map();
      }

      const group = this.groupedFields.get(this.activeTab);
      if (!group) {
        throw new ValidationError(
          `Tab group ${this.activeTab} has no value set`
        );
      }

      return group;
    },
  },
  mounted() {
    this.syncZoomFactor();
    // Keyboard / View-menu zoom uses the same webFrame factor; poll lightly
    // so the System tab label stays current while Settings is open.
    this._zoomSyncTimer = window.setInterval(() => this.syncZoomFactor(), 400);
    if (this.fyo.store.isDevelopment) {
      // @ts-ignore
      window.settings = this;
    }

    this.applyInitialTab();
    this.update();
  },
  beforeUnmount() {
    if (this._zoomSyncTimer != null) {
      window.clearInterval(this._zoomSyncTimer);
      this._zoomSyncTimer = null;
    }
  },
  activated(): void {
    this.syncZoomFactor();
    this.applyInitialTab();

    docsPathRef.value = docsPathMap.Settings ?? '';
    this.shortcuts?.pmod.set(COMPONENT_NAME, ['KeyS'], async () => {
      if (!this.canSave) {
        return;
      }

      await this.sync();
    });
  },
  async deactivated(): Promise<void> {
    docsPathRef.value = '';
    this.shortcuts?.delete(COMPONENT_NAME);
    if (!this.canSave) {
      return;
    }
    await this.reset();
  },
  methods: {
    applyInitialTab() {
      const tab = this.tab || this.$route.query.tab;
      if (typeof tab === 'string' && this.tabLabels[tab]) {
        this.activeTab = tab;
      }
    },
    settingsDocNames(): string[] {
      // POS lives on InventorySettings but is injected under General; keep it
      // in save/reset even when the Inventory tab is hidden.
      const names = new Set(this.schemas.map(({ name }) => name));
      names.add(ModelNameEnum.InventorySettings);
      return [...names];
    },
    syncZoomFactor() {
      const next = getDisplayZoomFactor();
      if (next !== this.zoomFactor) {
        this.zoomFactor = next;
      }
    },
    zoomIn() {
      this.zoomFactor = zoomDisplayIn(this.zoomFactor);
    },
    zoomOut() {
      this.zoomFactor = zoomDisplayOut(this.zoomFactor);
    },
    async reset() {
      const resetableDocs = this.settingsDocNames()
        .map((name) => this.fyo.singles[name])
        .filter((doc) => doc?.dirty) as Doc[];

      for (const doc of resetableDocs) {
        await doc.load();
      }

      this.update();
    },
    async sync(): Promise<void> {
      if (this.activeTab === CHECK_PRINTING_TAB) {
        const checkPrint = this.$refs.checkPrintSettings as
          | { save?: () => Promise<void> }
          | undefined;
        if (checkPrint?.save) {
          await checkPrint.save();
        }
        return;
      }

      const syncableDocs = this.settingsDocNames()
        .map((name) => this.fyo.singles[name])
        .filter((doc) => doc?.canSave) as Doc[];

      if (!syncableDocs.length) {
        return;
      }

      for (const doc of syncableDocs) {
        await this.syncDoc(doc);
      }

      this.update();
      await showDialog({
        title: this.t`Reload LiveBooks Desktop?`,
        detail: this.t`Changes made to settings will be visible on reload.`,
        type: 'info',
        buttons: [
          {
            label: this.t`Yes`,
            isPrimary: true,
            action: ipc.reloadWindow.bind(ipc),
          },
          {
            label: this.t`No`,
            action: () => null,
            isEscape: true,
          },
        ],
      });
    },
    async syncDoc(doc: Doc): Promise<void> {
      try {
        await doc.sync();
        this.updateGroupedFields();
      } catch (error) {
        await handleErrorWithDialog(error, doc);
      }
    },
    async onValueChange(field: Field, value: DocValue): Promise<void> {
      const { fieldname } = field;
      delete this.errors[fieldname];

      const doc = this.getDocForField(field);
      if (!doc) {
        return;
      }

      const setValue =
        field.fieldtype === 'Check' ? Boolean(value) : value ?? '';

      try {
        await doc.set(fieldname, setValue);
      } catch (err) {
        if (!(err instanceof Error)) {
          return;
        }

        this.errors[fieldname] = getErrorMessage(err, doc);
      }

      this.update();
    },
    getDocForField(field: Field): Doc | null {
      const schemaName = field.schemaName ?? this.activeTab;
      return this.fyo.singles[schemaName] ?? null;
    },
    async checkForUpdates(): Promise<void> {
      const result = await ipc.checkForUpdatesForce();

      if (result.status === 'skipped') {
        if (result.reason === 'development') {
          showToast({
            type: 'info',
            message: this
              .t`Update checks are disabled while running in development.`,
            duration: 'short',
          });
        } else if (result.reason === 'disabled') {
          showToast({
            type: 'info',
            message: this.t`Automatic updates are not enabled for this build.`,
            duration: 'short',
          });
        }
        return;
      }

      if (result.status === 'started') {
        showToast({
          type: 'info',
          message: this.t`Checking for updates…`,
          duration: 'short',
        });
        return;
      }

      if (result.status === 'error') {
        showToast({
          type: 'error',
          message:
            result.reason === 'network'
              ? this
                  .t`Could not reach the update server. Check your connection and try again.`
              : this.t`Could not check for updates.`,
          duration: 'short',
        });
      }
    },
    update(): void {
      this.updateGroupedFields();
    },
    updateGroupedFields(): void {
      const grouped: UIGroupedFields = new Map();
      const fields: Field[] = this.schemas.map((s) => s.fields).flat();

      for (const field of fields) {
        const schemaName = field.schemaName!;
        if (!grouped.has(schemaName)) {
          grouped.set(schemaName, new Map());
        }

        const tabbed = grouped.get(schemaName)!;
        const section = field.section ?? this.t`Miscellaneous`;
        if (!tabbed.has(section)) {
          tabbed.set(section, []);
        }

        if (field.meta) {
          continue;
        }

        if (field.fieldname === 'version') {
          continue;
        }

        const doc = this.fyo.singles[schemaName];
        if (evaluateHidden(field, doc)) {
          continue;
        }

        tabbed.get(section)!.push(field);
      }

      this.injectAccountingPosFields(grouped);

      this.groupedFields = grouped;
    },
    injectAccountingPosFields(grouped: UIGroupedFields): void {
      const accountingGroup = grouped.get(ModelNameEnum.AccountingSettings);
      const posField = this.fyo.schemaMap[
        ModelNameEnum.InventorySettings
      ]?.fields.find((f) => f.fieldname === 'enablePointOfSale');

      if (!accountingGroup || !posField) {
        return;
      }

      const featuresSection = this.t`Features`;
      const featuresFields = accountingGroup.get(featuresSection) ?? [];
      if (!accountingGroup.has(featuresSection)) {
        accountingGroup.set(featuresSection, featuresFields);
      }

      if (!featuresFields.some((f) => f.fieldname === 'enablePointOfSale')) {
        const inventoryIdx = featuresFields.findIndex(
          (f) => f.fieldname === 'enableInventory'
        );
        featuresFields.splice(
          inventoryIdx >= 0 ? inventoryIdx + 1 : 0,
          0,
          posField
        );
      }

      const withoutIdx = featuresFields.findIndex(
        (f) => f.fieldname === 'enablePointOfSaleWithOutInventory'
      );
      const posIdx = featuresFields.findIndex(
        (f) => f.fieldname === 'enablePointOfSale'
      );

      if (withoutIdx >= 0 && posIdx >= 0 && withoutIdx !== posIdx + 1) {
        const [withoutField] = featuresFields.splice(withoutIdx, 1);
        featuresFields.splice(posIdx + 1, 0, withoutField);
      }
    },
  },
});
</script>
