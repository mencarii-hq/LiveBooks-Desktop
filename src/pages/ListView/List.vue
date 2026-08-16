<template>
  <div class="text-base flex flex-col overflow-hidden px-4">
    <div
      class="
        flex flex-col flex-1
        min-h-0
        overflow-x-auto
        custom-scroll custom-scroll-thumb1
      "
    >
      <!-- Empty State (centered in the list pane) -->
      <div
        v-if="!data?.length"
        class="flex flex-1 flex-col items-center justify-center"
      >
        <img src="../../assets/img/list-empty-state.svg" alt="" class="w-24" />
        <p class="my-3 text-gray-800 dark:text-gray-100">
          {{ t`No entries found` }}
        </p>
        <Button v-if="canCreate" type="primary" @click="$emit('makeNewDoc')">
          {{ t`Make Entry` }}
        </Button>
      </div>

      <div v-else class="flex flex-col min-h-0" :style="tableWidthStyle">
        <!-- Title Row -->
        <div
          class="flex items-center"
          :style="{
            paddingRight: dataSlice.length > 13 ? 'var(--w-scrollbar)' : '',
          }"
        >
          <div
            v-if="!isSelectionMode"
            class="w-8 text-start me-2 text-gray-700 dark:text-gray-300"
          >
            #
          </div>
          <div v-else class="w-8 flex justify-end me-2">
            <Check
              :df="{
                fieldtype: 'Check',
                fieldname: 'selectAll',
                label: '',
              }"
              :show-label="false"
              :value="isAllSelected"
              @change="toggleSelectAll"
            />
          </div>
          <Row
            ref="headerRow"
            class="flex-1 text-gray-700 dark:text-gray-300 min-h-row-mid"
            :column-count="columns.length"
            :grid-template-columns="gridTemplate"
            gap="0.5rem"
          >
            <div
              v-for="(column, i) in columns"
              :key="column.label"
              class="
                relative
                items-center
                justify-start
                text-start
                flex
                min-w-0 min-h-row-mid
                py-1.5
                pe-3
                break-words
              "
              :class="{
                'pe-4': i === columns.length - 1 && !showRunNow,
              }"
            >
              {{ column.label }}
              <ColResizeHandle
                v-if="i < columns.length - 1"
                :title="t`Drag to resize. Double-click to reset.`"
                @start="startColResize(i, $event)"
                @reset="resetColWidths"
              />
            </div>
          </Row>
          <div
            v-if="showRunNow && !isSelectionMode"
            class="
              w-28
              shrink-0
              ms-2
              text-gray-700
              dark:text-gray-300
              h-row
              flex
              items-center
              pe-4
            "
          >
            {{ t`Actions` }}
          </div>
        </div>
        <hr class="dark:border-gray-800" />

        <!-- Data Rows -->
        <div
          v-if="dataSlice.length !== 0"
          class="
            overflow-y-auto
            dark:dark-scroll
            custom-scroll custom-scroll-thumb1
          "
        >
          <div v-for="(row, i) in dataSlice" :key="(row.name as string)">
            <!-- Row Content -->
            <div
              class="flex hover:bg-gray-50 dark:hover:bg-gray-850 items-center"
            >
              <div
                v-if="!isSelectionMode"
                class="w-8 text-start me-2 text-gray-700 dark:text-gray-300"
              >
                {{ i + pageStart + 1 }}
              </div>
              <div v-else class="w-8 flex justify-end me-2">
                <Check
                  :df="{
                    fieldtype: 'Check',
                    fieldname: 'selectItem',
                    label: '',
                  }"
                  :show-label="false"
                  :value="selectedItems.includes(row.name as string)"
                  @change="toggleItemSelection(row.name as string)"
                />
              </div>

              <Row
                data-list-row
                gap="0.5rem"
                class="
                  cursor-pointer
                  text-gray-900
                  dark:text-gray-300
                  flex-1
                  min-h-row-mid
                "
                :column-count="columns.length"
                :grid-template-columns="gridTemplate"
                @click="isSelectionMode ? null : $emit('openDoc', row.name)"
                @contextmenu.prevent.stop="
                  isSelectionMode
                    ? null
                    : $emit('openDocInPane', row.name, $event)
                "
              >
                <ListCell
                  v-for="(column, c) in columns"
                  :key="column.label || column.fieldname"
                  :class="{
                    'pe-4': c === columns.length - 1 && !showRunNow,
                  }"
                  :row="(row as RenderData)"
                  :column="column"
                  @status-found="handleStatusFound"
                />
              </Row>
              <div
                v-if="showRunNow && !isSelectionMode"
                class="w-28 shrink-0 ms-2 pe-4 flex items-center"
                @click.stop
              >
                <Button
                  type="secondary"
                  class="whitespace-nowrap"
                  :disabled="!!runningName"
                  @click="runMemorized(row.name as string)"
                >
                  {{ runningName === row.name ? t`Running…` : t`Run Now` }}
                </Button>
              </div>
            </div>
            <hr
              v-if="!(i === dataSlice.length - 1 && i > 13)"
              class="dark:border-gray-800"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Pagination Footer -->
    <div v-if="data?.length" class="mt-auto">
      <hr class="dark:border-gray-800" />
      <Paginator :item-count="data.length" @index-change="setPageIndices" />
    </div>
  </div>
</template>
<script lang="ts">
import { ListViewSettings, RenderData } from 'fyo/model/types';
import { cloneDeep } from 'lodash';
import Button from 'src/components/Button.vue';
import ColResizeHandle from 'src/components/ColResizeHandle.vue';
import Check from 'src/components/Controls/Check.vue';
import Paginator from 'src/components/Paginator.vue';
import Row from 'src/components/Row.vue';
import { fyo } from 'src/initFyo';
import { getPartyNameMap, partyLabel } from 'src/utils/partyNames';
import { FieldTypeEnum } from 'schemas/types';
import { isUuidDocId } from 'utils/ids';
import { isNumeric } from 'src/utils';
import {
  clampColWidth,
  clearColumnWidths,
  columnWidthsStorageKey,
  FALLBACK_COL_GAP_PX,
  gridTemplateFromWidths,
  measureRowGapPx,
  minWidthPxFromColumns,
  readColumnWidths,
  snapshotChildrenWidths,
  writeColumnWidths,
} from 'src/utils/columnWidths';
import { QueryFilter } from 'utils/db/types';
import { PropType, defineComponent, toRaw } from 'vue';
import ListCell from './ListCell.vue';

const FALLBACK_INDEX_COL_PX = 40;
const FALLBACK_ACTIONS_COL_PX = 112;

export default defineComponent({
  name: 'List',
  components: {
    Row,
    ListCell,
    Button,
    Check,
    Paginator,
    ColResizeHandle,
  },
  props: {
    listConfig: {
      type: Object as PropType<ListViewSettings | undefined>,
      default: () => ({ columns: [] }),
    },
    filters: {
      type: Object as PropType<QueryFilter>,
      default: () => ({}),
    },
    schemaName: { type: String, required: true },
    canCreate: Boolean,
    isSelectionMode: Boolean,
  },
  emits: [
    'openDoc',
    'openDocInPane',
    'makeNewDoc',
    'updatedData',
    'selected-items-changed',
  ],
  data() {
    return {
      data: [] as RenderData[],
      pageStart: 0,
      pageEnd: 0,
      statusMap: {} as Record<string, string>,
      selectedItems: [] as string[],
      runningName: null as string | null,
      columnWidths: null as number[] | null,
      boundColResizeMove: null as ((e: MouseEvent) => void) | null,
      boundEndColResize: null as (() => void) | null,
      resizingCol: -1,
      resizeStartX: 0,
      resizeStartWidth: 0,
      resizeMoved: false,
    };
  },
  computed: {
    dataSlice() {
      return this.data.slice(this.pageStart, this.pageEnd);
    },
    count() {
      return this.pageEnd - this.pageStart + 1;
    },
    isAllSelected(): boolean {
      return (
        this.data.length > 0 && this.selectedItems.length === this.data.length
      );
    },
    showRunNow(): boolean {
      return this.schemaName === 'MemorizedTransaction';
    },
    columns() {
      let columns = this.listConfig?.columns ?? [];

      if (columns.length === 0) {
        columns = fyo.schemaMap[this.schemaName]?.quickEditFields ?? [];
        columns = [...new Set(['name', ...columns])];
      }

      return columns
        .map((fieldname) => {
          if (typeof fieldname === 'object') {
            return fieldname;
          }

          return fyo.getField(this.schemaName, fieldname);
        })
        .filter(Boolean);
    },
    columnIds(): string[] {
      return this.columns.map(
        (c: { fieldname?: string; label?: string }, i: number) =>
          String(c.fieldname || c.label || `col-${i}`)
      );
    },
    widthsStorageKey(): string {
      return columnWidthsStorageKey(`list:${this.schemaName}`);
    },
    gridTemplate(): string | null {
      if (!this.columnWidths) {
        return null;
      }
      return gridTemplateFromWidths(this.columnWidths);
    },
    tableWidthStyle(): Record<string, string> {
      if (!this.columnWidths) {
        return {};
      }
      const headerRow = this.$refs.headerRow as
        | { $el?: HTMLElement }
        | undefined;
      const gapPx = measureRowGapPx(headerRow?.$el, FALLBACK_COL_GAP_PX);
      let extra = FALLBACK_INDEX_COL_PX;
      if (this.showRunNow && !this.isSelectionMode) {
        extra += FALLBACK_ACTIONS_COL_PX;
      }
      const total = minWidthPxFromColumns(this.columnWidths, gapPx, extra);
      return { minWidth: `${total}px` };
    },
  },
  watch: {
    async schemaName(oldValue, newValue) {
      if (oldValue === newValue) {
        return;
      }

      this.loadStoredWidths();
      await this.updateData();
    },
    columnIds: {
      handler() {
        this.loadStoredWidths();
      },
      immediate: true,
    },
  },
  async mounted() {
    this.loadStoredWidths();
    await this.updateData();
    this.setUpdateListeners();
  },
  unmounted() {
    this.endColResize();
  },
  deactivated() {
    this.endColResize();
  },
  methods: {
    loadStoredWidths() {
      this.columnWidths = readColumnWidths(
        this.widthsStorageKey,
        this.columnIds
      );
    },
    handleStatusFound({ rowId, status }: { rowId: string; status: string }) {
      this.statusMap[rowId] = status;
    },
    isNumeric,
    setPageIndices({ start, end }: { start: number; end: number }) {
      this.pageStart = start;
      this.pageEnd = end;
    },
    startColResize(index: number, event: MouseEvent) {
      if (!this.columnWidths) {
        const headerRow = this.$refs.headerRow as
          | { $el?: HTMLElement }
          | undefined;
        const snapped = snapshotChildrenWidths(
          headerRow?.$el,
          this.columnIds.length
        );
        if (!snapped) {
          return;
        }
        this.columnWidths = snapped;
      }
      this.resizingCol = index;
      this.resizeStartX = event.clientX;
      this.resizeStartWidth = this.columnWidths[index];
      this.resizeMoved = false;
      this.boundColResizeMove = (e: MouseEvent) => this.onColResizeMove(e);
      this.boundEndColResize = () => this.endColResize();
      window.addEventListener('mousemove', this.boundColResizeMove);
      window.addEventListener('mouseup', this.boundEndColResize);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    onColResizeMove(event: MouseEvent) {
      if (this.resizingCol < 0 || !this.columnWidths) {
        return;
      }
      const dx = event.clientX - this.resizeStartX;
      const next = clampColWidth(this.resizeStartWidth + dx);
      if (next === this.columnWidths[this.resizingCol]) {
        return;
      }
      this.resizeMoved = true;
      const widths = [...this.columnWidths];
      widths[this.resizingCol] = next;
      this.columnWidths = widths;
    },
    endColResize() {
      if (this.resizingCol < 0) {
        return;
      }
      this.resizingCol = -1;
      window.removeEventListener('mousemove', this.boundColResizeMove);
      window.removeEventListener('mouseup', this.boundEndColResize);
      this.boundColResizeMove = null;
      this.boundEndColResize = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (!this.resizeMoved || !this.columnWidths) {
        return;
      }
      try {
        writeColumnWidths(
          this.widthsStorageKey,
          this.columnIds,
          this.columnWidths
        );
      } catch {
        /* best-effort */
      }
    },
    resetColWidths() {
      this.columnWidths = null;
      clearColumnWidths(this.widthsStorageKey);
    },
    async runMemorized(name: string) {
      if (this.runningName) {
        return;
      }
      this.runningName = name;
      try {
        const { writeEntryRouteFromMemorized } = await import(
          'src/utils/memorizedTransactions'
        );
        const { handleErrorWithDialog } = await import('src/errorHandling');
        const { ModelNameEnum } = await import('models/types');
        const { routeTo } = await import('src/utils/ui');
        const mt = await fyo.doc.getDoc(
          ModelNameEnum.MemorizedTransaction,
          name
        );
        try {
          // Review-then-post: open Write Entry prefilled. Never copy a
          // stored check # (blank / next-number on the form).
          await routeTo(writeEntryRouteFromMemorized(mt));
        } catch (error) {
          await handleErrorWithDialog(error, mt, true, true);
        }
      } finally {
        this.runningName = null;
      }
    },
    setUpdateListeners() {
      if (!this.schemaName) {
        return;
      }

      const listener = async () => {
        await this.updateData();
      };

      if (fyo.schemaMap[this.schemaName]?.isSubmittable) {
        fyo.doc.observer.on(`submit:${this.schemaName}`, listener);
        fyo.doc.observer.on(`revert:${this.schemaName}`, listener);
      }

      fyo.doc.observer.on(`sync:${this.schemaName}`, listener);
      fyo.db.observer.on(`delete:${this.schemaName}`, listener);
      fyo.doc.observer.on(`rename:${this.schemaName}`, listener);
    },
    async updateData(filters?: Record<string, unknown>) {
      const baseFilters = cloneDeep(toRaw(this.filters));
      filters = cloneDeep({ ...baseFilters, ...filters });

      let statusFilter: [string, string] | undefined;

      if ('status' in filters) {
        statusFilter = filters['status'] as [string, string];
      }

      const isStatusFilter =
        Array.isArray(statusFilter) && statusFilter[0] === 'like';
      if (isStatusFilter) {
        delete filters['status'];
      }

      const orderBy = ['created'];
      if (fyo.db.fieldMap[this.schemaName]['date']) {
        orderBy.unshift('date');
      }

      if (this.schemaName === 'MemorizedTransaction') {
        const { repairMemorizedTransactionTitles } = await import(
          'src/utils/memorizedTransactions'
        );
        await repairMemorizedTransactionTitles(fyo);
      }

      const tableData = await fyo.db.getAll(this.schemaName, {
        fields: ['*'],
        filters: filters as QueryFilter,
        orderBy,
      });

      let filteredData = tableData;

      if (isStatusFilter && statusFilter?.[1]) {
        const lowercaseStatus = String(statusFilter[1]).toLowerCase();

        const matchedNames = Object.entries(this.statusMap)
          .filter((entry) => entry[1].toLowerCase() === lowercaseStatus)
          .map((entry) => entry[0]);

        filteredData = tableData.filter((row) =>
          matchedNames.includes(String(row.name))
        );
      }

      const schema = fyo.schemaMap[this.schemaName];
      const partyLinkFields = (schema?.fields ?? []).filter(
        (f) =>
          f.fieldtype === FieldTypeEnum.Link &&
          f.target === 'Party' &&
          !f.computed
      );
      const partyIds = [
        ...new Set(
          filteredData.flatMap((d) =>
            partyLinkFields
              .map((f) => d[f.fieldname])
              .filter((v): v is string => typeof v === 'string' && !!v)
          )
        ),
      ];
      const partyNames = partyIds.length
        ? await getPartyNameMap(fyo, partyIds)
        : new Map<string, string>();

      this.data = filteredData.map((d) => {
        const row: Record<string, unknown> = {
          ...d,
          schema,
        };
        for (const f of partyLinkFields) {
          const id = row[f.fieldname];
          if (typeof id !== 'string' || !id) {
            continue;
          }
          const label = partyLabel(partyNames, id);
          row[f.fieldname] =
            label && !isUuidDocId(label) ? label : isUuidDocId(id) ? '' : id;
        }
        // MemorizedTransaction.title was sometimes saved as Party.id (UUID).
        const rawTitle = d.title;
        if (
          this.schemaName === 'MemorizedTransaction' &&
          typeof rawTitle === 'string' &&
          isUuidDocId(rawTitle)
        ) {
          const partyId = typeof d.party === 'string' ? d.party : '';
          const titleLabel = partyLabel(partyNames, partyId);
          if (titleLabel) {
            row.title = titleLabel;
          }
        }
        return row;
      }) as RenderData[];
      this.$emit('updatedData', filters);
    },
    toggleItemSelection(itemName: string) {
      const index = this.selectedItems.indexOf(itemName);
      if (index > -1) {
        this.selectedItems.splice(index, 1);
      } else {
        this.selectedItems.push(itemName);
      }
      this.$emit('selected-items-changed', this.selectedItems);
    },
    toggleSelectAll(checked: boolean) {
      this.selectedItems = checked
        ? this.data.map((row) => row.name as string)
        : [];
      this.$emit('selected-items-changed', this.selectedItems);
    },
  },
});
</script>
