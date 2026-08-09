<template>
  <div v-if="tableFields?.length">
    <div v-if="showLabel" class="text-gray-600 dark:text-gray-300 text-sm mb-1">
      {{ df.label }}
    </div>

    <div
      :class="border ? 'border dark:border-gray-800 rounded-md' : ''"
      class="overflow-x-auto custom-scroll custom-scroll-thumb1"
    >
      <div :style="tableWidthStyle">
        <!-- Title Row -->
        <Row
          ref="headerRow"
          :ratio="ratio"
          :grid-template-columns="gridTemplate"
          class="
            border-b
            dark:border-gray-800
            px-2
            text-gray-600
            dark:text-gray-300
            w-full
            items-center
          "
        >
          <div class="relative flex items-center ps-2 min-w-0">
            #
            <ColResizeHandle
              :title="t`Drag to resize. Double-click to reset.`"
              @start="startColResize(0, $event)"
              @reset="resetColWidths"
            />
          </div>
          <div
            v-for="(fieldDf, fi) in tableFields"
            :key="fieldDf.fieldname"
            class="relative flex px-2 h-row-mid min-w-0"
            :class="[
              fieldDf.sub_label
                ? 'flex-col items-center text-center'
                : isNumeric(fieldDf)
                ? 'justify-end items-center'
                : 'items-center',
            ]"
          >
            <span>{{ fieldDf.label }}</span>
            <p v-if="fieldDf.sub_label" class="text-xs">
              {{ fieldDf.sub_label }}
            </p>
            <ColResizeHandle
              v-if="fi < tableFields.length - 1 || canEditRow"
              :title="t`Drag to resize. Double-click to reset.`"
              @start="startColResize(fi + 1, $event)"
              @reset="resetColWidths"
            />
          </div>
          <div v-if="canEditRow" class="min-w-0" />
        </Row>

        <!-- Data Rows -->
        <div
          v-if="value"
          class="overflow-auto custom-scroll custom-scroll-thumb1"
          :style="{ 'max-height': maxHeight }"
        >
          <TableRow
            v-for="(row, idx) of value"
            ref="table-row"
            :key="row.name"
            :class="
              idx < value.length - 1 ? 'border-b dark:border-gray-800' : ''
            "
            v-bind="{ row, tableFields, size, ratio, isNumeric }"
            :grid-template-columns="gridTemplate"
            :read-only="isReadOnly"
            :can-edit-row="canEditRow"
            @remove="removeRow(row)"
            @change="(field, value) => $emit('row-change', field, value, df)"
          />
        </div>

        <!-- Add Row and Row Count -->
        <Row
          v-if="!isReadOnly"
          :ratio="ratio"
          :grid-template-columns="gridTemplate"
          class="
            text-gray-500
            cursor-pointer
            px-2
            w-full
            h-row-mid
            items-center
            focus:outline-none focus:ring-1 focus:ring-blue-500
          "
          :class="value.length > 0 ? 'border-t dark:border-gray-800' : ''"
          tabindex="0"
          @click="addRow"
          @keydown.enter="addRow"
        >
          <div class="flex items-center ps-1">
            <feather-icon name="plus" class="w-4 h-4 text-gray-500" />
          </div>
          <div
            class="flex justify-between px-2"
            :style="`grid-column: 2 / ${ratio.length + 1}`"
          >
            <p>
              {{ t`Add Row` }}
            </p>
            <p
              v-if="
                value &&
                maxRowsBeforeOverflow &&
                value.length > maxRowsBeforeOverflow
              "
              class="text-start px-2"
            >
              {{ t`${value.length} rows` }}
            </p>
          </div>
        </Row>
      </div>
    </div>
  </div>
</template>

<script>
import ColResizeHandle from 'src/components/ColResizeHandle.vue';
import Row from 'src/components/Row.vue';
import { fyo } from 'src/initFyo';
import {
  clampColWidth,
  clearColumnWidths,
  columnWidthsStorageKey,
  gridTemplateFromWidths,
  minWidthPxFromColumns,
  readColumnWidths,
  snapshotChildrenWidths,
  writeColumnWidths,
} from 'src/utils/columnWidths';
import { nextTick } from 'vue';
import Base from './Base.vue';
import TableRow from './TableRow.vue';

export default {
  name: 'Table',
  components: {
    Row,
    TableRow,
    ColResizeHandle,
  },
  extends: Base,
  props: {
    value: { type: Array, default: () => [] },
    showHeader: {
      type: Boolean,
      default: true,
    },
    maxRowsBeforeOverflow: {
      type: Number,
      default: 3,
    },
    border: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['editrow', 'row-change'],
  data() {
    return {
      maxHeight: '',
      columnWidths: null,
      boundColResizeMove: null,
      boundEndColResize: null,
      resizingCol: -1,
      resizeStartX: 0,
      resizeStartWidth: 0,
      resizeMoved: false,
    };
  },
  computed: {
    height() {
      if (this.size === 'small') {
      }
      return 2;
    },
    canEditRow() {
      return this.df.edit;
    },
    ratio() {
      const ratio = [0.3].concat(this.tableFields.map(() => 1));

      if (this.canEditRow) {
        return ratio.concat(0.3);
      }

      return ratio;
    },
    tableFields() {
      const fields = fyo.schemaMap[this.df.target].tableFields ?? [];
      return fields.map((fieldname) => fyo.getField(this.df.target, fieldname));
    },
    columnIds() {
      const ids = ['__index'].concat(this.tableFields.map((f) => f.fieldname));
      if (this.canEditRow) {
        ids.push('__edit');
      }
      return ids;
    },
    widthsStorageKey() {
      return columnWidthsStorageKey(`table:${this.df.target}`);
    },
    gridTemplate() {
      if (!this.columnWidths) {
        return null;
      }
      return gridTemplateFromWidths(this.columnWidths, {
        lastAbsorbs: !this.canEditRow,
      });
    },
    tableWidthStyle() {
      if (!this.columnWidths) {
        return {};
      }
      const total = minWidthPxFromColumns(this.columnWidths, 0, 16);
      return { minWidth: `${total}px` };
    },
  },
  watch: {
    value() {
      this.setMaxHeight();
    },
    columnIds: {
      handler() {
        this.loadStoredWidths();
      },
      immediate: true,
    },
  },
  mounted() {
    this.loadStoredWidths();
    if (fyo.store.isDevelopment) {
      window.tab = this;
    }
  },
  unmounted() {
    this.endColResize();
  },

  methods: {
    loadStoredWidths() {
      this.columnWidths = readColumnWidths(
        this.widthsStorageKey,
        this.columnIds
      );
    },
    focus() {},
    startColResize(index, event) {
      if (!this.columnWidths) {
        const headerRow = this.$refs.headerRow;
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
      this.boundColResizeMove = (e) => this.onColResizeMove(e);
      this.boundEndColResize = () => this.endColResize();
      window.addEventListener('mousemove', this.boundColResizeMove);
      window.addEventListener('mouseup', this.boundEndColResize);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    onColResizeMove(event) {
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
    async addRow() {
      await this.doc.append(this.df.fieldname);
      await nextTick();
      this.scrollToRow(this.value.length - 1);
      this.triggerChange(this.value);
      this.$nextTick(() => {
        const rows = this.$refs['table-row'];
        if (rows && rows.length > 0) {
          const lastRow = rows[rows.length - 1];
          if (lastRow.focusFirstInput) {
            lastRow.focusFirstInput();
          }
        }
      });
    },
    removeRow(row) {
      this.doc.remove(this.df.fieldname, row.idx).then((s) => {
        if (!s) {
          return;
        }
        this.triggerChange(this.value);
      });
    },

    scrollToRow(index) {
      const row = this.$refs['table-row'][index];
      row && row.$el.scrollIntoView({ block: 'nearest' });
    },

    setMaxHeight() {
      if (this.maxRowsBeforeOverflow === 0) {
        return (this.maxHeight = '');
      }

      const size = this?.value?.length ?? 0;
      if (size === 0) {
        return (this.maxHeight = '');
      }

      const rowHeight = this.$refs?.['table-row']?.[0]?.$el.offsetHeight;
      if (rowHeight === undefined) {
        return (this.maxHeight = '');
      }

      const maxHeight = rowHeight * Math.min(this.maxRowsBeforeOverflow, size);
      return (this.maxHeight = `${maxHeight}px`);
    },
  },
};
</script>
