<template>
  <Popover
    ref="filterPopover"
    v-if="fields.length"
    placement="bottom-end"
    @open="onPopoverOpen"
    @close="onPopoverClose"
    :close-on-click-outside="true"
    :close-on-click-content="false"
  >
    <template #target="{ togglePopover }">
      <Button :icon="true" @click="togglePopover()">
        <span class="flex items-center">
          <Icon name="filter" size="12" class="stroke-current text-ink" />
          <span class="ms-1">
            <template v-if="activeFilterCount > 0">
              {{ filterAppliedMessage }}
            </template>
            <template v-else>
              {{ t`Filter` }}
            </template>
          </span>
        </span>
      </Button>
    </template>
    <template #content>
      <div>
        <div class="p-2">
          <template v-if="draftFilters.length">
            <div class="flex flex-col gap-2">
              <div
                v-for="(filter, i) in draftFilters"
                :key="`${i}-${filter.fieldname}`"
                class="flex items-center justify-between text-base gap-2"
              >
                <div
                  class="
                    cursor-pointer
                    w-4
                    h-4
                    flex
                    items-center
                    justify-center
                    text-gray-600
                    dark:text-gray-300
                    hover:text-gray-800
                    dark:hover:text-gray-300
                    rounded-md
                    group
                  "
                >
                  <span class="hidden group-hover:inline-block">
                    <feather-icon
                      name="x"
                      class="w-4 h-4 cursor-pointer"
                      :button="true"
                      @click="removeFilter(i)"
                    />
                  </span>
                  <span class="group-hover:hidden">
                    {{ i + 1 }}
                  </span>
                </div>
                <Select
                  :border="true"
                  size="small"
                  class="w-24"
                  :df="{
                    label: t`Field`,
                    placeholder: t`field`,
                    fieldname: 'fieldname',
                    fieldtype: 'Select',
                    options: fieldOptions,
                  }"
                  :value="filter.fieldname"
                  @mousedown.stop
                  @click.stop
                  @change="(value) => updateNewFilters(i, 'fieldname', value)"
                  @keydown.enter="applyFilters"
                />

                <Select
                  :border="true"
                  size="small"
                  class="w-24"
                  :df="{
                    label: t`Condition`,
                    placeholder: t`Condition`,
                    fieldname: 'condition',
                    fieldtype: 'Select',
                    options: conditionsForDropdown,
                  }"
                  :value="filter.condition"
                  :close-drop-down="false"
                  @mousedown.stop
                  @click.stop
                  @change="(value) => updateNewFilters(i, 'condition', value)"
                  @keydown.enter="applyFilters"
                />

                <Data
                  :border="true"
                  size="small"
                  class="w-24"
                  :df="{
                    label: t`Value`,
                    placeholder: t`Value`,
                    fieldname: 'value',
                    fieldtype: 'Data',
                  }"
                  :value="String(filter.value)"
                  :close-drop-down="false"
                  @mousedown.stop
                  @click.stop
                  @change="(value) => updateNewFilters(i, 'value', value)"
                  @keydown.enter="applyFilters"
                />
              </div>
            </div>
          </template>
          <template v-else>
            <span class="text-base text-gray-600 dark:text-gray-500">{{
              t`No filters selected`
            }}</span>
          </template>
        </div>
        <div class="flex justify-between border-t dark:border-gray-800">
          <div
            class="
              text-base
              border-t
              dark:border-gray-800
              p-2
              flex
              items-center
              text-gray-600
              dark:text-gray-500
              cursor-pointer
              hover:bg-gray-100
              dark:hover:bg-gray-875
            "
            @click.stop="addNewFilter"
          >
            <feather-icon name="plus" class="w-4 h-4" />
            <span class="ms-2">{{ t`Add a filter` }}</span>
          </div>

          <div class="flex">
            <div
              v-if="newFilters.length || filters.length"
              class="
                text-base
                p-2
                flex
                items-center
                text-gray-600
                dark:text-gray-500
                cursor-pointer
                hover:bg-gray-100
                dark:hover:bg-gray-875
              "
              @click="clearAllFilters"
            >
              <feather-icon name="trash-2" class="w-4 h-4" />
              <span class="ms-2">{{ t`Clear` }}</span>
            </div>

            <div
              v-if="newFilters.length"
              @click="applyFilters"
              class="
                text-base
                border-t
                dark:border-gray-800
                p-2
                flex
                items-center
                text-gray-600
                dark:text-gray-500
                cursor-pointer
                hover:bg-gray-100
                dark:hover:bg-gray-875
              "
            >
              <feather-icon name="search" class="w-4 h-4" />
              <span class="ml-2 text-sm">{{ t`Apply` }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>
  </Popover>
</template>
<script lang="ts">
import { Field, FieldTypeEnum } from 'schemas/types';
import { fyo } from 'src/initFyo';
import { defineComponent, PropType } from 'vue';
import Button from './Button.vue';
import Data from './Controls/Data.vue';
import Select from './Controls/Select.vue';
import Icon from './Icon.vue';
import Popover from './Popover.vue';
import { QueryFilter } from 'utils/db/types';
import { t } from 'fyo';

const conditions = [
  { label: t`Is`, value: '=' },
  { label: t`Is Not`, value: '!=' },
  { label: t`Contains`, value: 'like' },
  { label: t`Does Not Contain`, value: 'not like' },
  { label: t`Greater Than`, value: '>' },
  { label: t`Less Than`, value: '<' },
  { label: t`Is Empty`, value: 'is null' },
  { label: t`Is Not Empty`, value: 'is not null' },
] as const;

type Condition = typeof conditions[number]['label'];

type Filter = {
  fieldname: string;
  condition: Condition;
  value: QueryFilter[string];
  implicit: boolean;
};

export default defineComponent({
  name: 'FilterDropdown',
  components: {
    Popover,
    Button,
    Icon,
    Select,
    Data,
  },
  props: {
    schemaName: { type: String, required: true },
    excludeFields: {
      type: Array as PropType<string[]>,
      default: () => [],
    },
    includeFields: {
      type: Array as PropType<string[]>,
      default: () => [],
    },
  },
  emits: ['change'],
  data() {
    return {
      filters: [] as Filter[],
      newFilters: [] as Filter[],
    };
  },
  computed: {
    fields(): Field[] {
      const excludedFieldsTypes: string[] = [
        FieldTypeEnum.Table,
        FieldTypeEnum.Attachment,
        FieldTypeEnum.AttachImage,
      ];

      const excludeSet = new Set(this.excludeFields);
      const includeSet = new Set(this.includeFields);
      const whitelist = includeSet.size > 0;

      const listViewSettings =
        fyo.models[this.schemaName]?.getListViewSettings?.(fyo);
      const statusColumn = listViewSettings?.columns?.[1] as
        | string
        | { fieldname?: string }
        | undefined;
      const statusFieldname =
        typeof statusColumn === 'string'
          ? statusColumn
          : statusColumn?.fieldname;

      const allFields = fyo.schemaMap[this.schemaName]?.fields ?? [];
      const filteredFields = allFields.filter((f) => {
        if (excludeSet.has(f.fieldname)) {
          return false;
        }

        if (whitelist) {
          return includeSet.has(f.fieldname);
        }

        if (includeSet.has(f.fieldname)) {
          return true;
        }

        if (f.filter) {
          return true;
        }

        if (excludedFieldsTypes.includes(f.fieldtype)) {
          return false;
        }

        if (f.computed || f.meta || f.readOnly) {
          return false;
        }

        return true;
      });

      for (const fieldname of this.includeFields) {
        if (excludeSet.has(fieldname)) {
          continue;
        }
        if (filteredFields.some((field) => field.fieldname === fieldname)) {
          continue;
        }

        const field = allFields.find((f) => f.fieldname === fieldname);
        if (field) {
          filteredFields.push(field);
        }
      }

      // Do not re-inject excluded columns (Check Register excludes account).
      if (
        statusFieldname &&
        !excludeSet.has(statusFieldname) &&
        (!whitelist || includeSet.has(statusFieldname))
      ) {
        const statusFieldExists = filteredFields.some(
          (field) => field.fieldname === statusFieldname
        );

        if (!statusFieldExists) {
          const originalStatusField = allFields.find(
            (field) => field.fieldname === statusFieldname
          );
          if (originalStatusField) {
            filteredFields.unshift(originalStatusField);
          } else if (typeof statusColumn === 'object' && statusColumn) {
            filteredFields.unshift(statusColumn as Field);
          }
        }
      }

      return filteredFields;
    },
    fieldOptions(): { label: string; value: string }[] {
      return this.fields.map((df) => ({
        label: df.label,
        value: df.fieldname,
      }));
    },
    conditions(): { label: string; value: string }[] {
      return [...conditions];
    },
    conditionsForDropdown(): { label: string; value: string }[] {
      return conditions.map((c) => ({
        label: c.label,
        value: c.label,
      }));
    },
    draftFilters(): Filter[] {
      return this.newFilters.filter((f) => !f.implicit);
    },
    activeFilterCount(): number {
      return this.filters
        .filter((f) => !f.implicit)
        .filter((filter) => filter.value).length;
    },
    filterAppliedMessage(): string {
      if (this.activeFilterCount === 1) {
        return this.t`1 filter applied`;
      }

      return this.t`${this.activeFilterCount} filters applied`;
    },
  },

  methods: {
    cloneFilters(filters: Filter[]): Filter[] {
      return JSON.parse(JSON.stringify(filters)) as Filter[];
    },
    onPopoverOpen(): void {
      this.newFilters = this.cloneFilters(this.filters);
    },
    onPopoverClose(): void {
      this.newFilters = this.cloneFilters(this.filters);
    },
    getConditionLabel(value: string): string {
      const condition = conditions.find((c) => c.value === value);
      return condition ? condition.label : value;
    },

    getConditionValue(label: string): string {
      const condition = conditions.find((c) => c.label === label);
      return condition ? condition.value : label;
    },

    addNewFilter(): void {
      const df = this.fields[0];
      if (!df) {
        return;
      }

      this.newFilters.push({
        fieldname: df.fieldname,
        condition: this.getConditionLabel('like') as Condition,
        value: '',
        implicit: false,
      });
    },
    addFilter(
      fieldname: string,
      condition: string,
      value: Filter['value'],
      implicit?: boolean
    ): void {
      const displayCondition = this.getConditionLabel(condition);
      const newFilter = {
        fieldname,
        condition: displayCondition,
        value,
        implicit: !!implicit,
      };
      this.filters.push(newFilter);
      this.newFilters.push({ ...newFilter });
    },

    applyFilters() {
      this.emitFilterChange();
      this.$refs.filterPopover?.close?.();
    },

    removeFilter(index: number): void {
      const filter = this.draftFilters[index];
      const idx = this.newFilters.indexOf(filter);
      if (idx >= 0) {
        this.newFilters.splice(idx, 1);
      }
    },

    clearAllFilters(): void {
      this.filters = [];
      this.newFilters = [];

      this.$emit('change', {});
    },

    updateNewFilters<K extends keyof Filter>(
      index: number,
      key: K,
      value: Filter[K]
    ) {
      const filter = this.draftFilters[index];
      const idx = this.newFilters.indexOf(filter);
      if (idx < 0) {
        return;
      }

      if (key === 'condition') {
        const displayCondition = this.getConditionLabel(value as string);
        this.newFilters[idx][key] = displayCondition as Filter[K];
      } else {
        this.newFilters[idx][key] = value;
      }
    },

    setFilter(filters: QueryFilter, implicit?: boolean): void {
      this.filters = [];
      this.newFilters = [];

      Object.keys(filters).map((fieldname) => {
        let parts = filters[fieldname];
        let condition: Condition;
        let value: Filter['value'];

        if (Array.isArray(parts)) {
          condition = parts[0] as Condition;
          value = parts[1] as Filter['value'];
        } else {
          condition = '=';
          value = parts;
        }

        this.addFilter(fieldname, condition, value, implicit);
      });

      this.emitFilterChange();
    },

    emitFilterChange(): void {
      const filters: Record<string, [Condition, Filter['value']]> = {};

      for (const { condition, value, fieldname } of this.newFilters) {
        if (value === '' || value === null || value === undefined) {
          continue;
        }

        const sqlCondition = this.getConditionValue(condition);

        if (fieldname === 'numberSeries') {
          filters['name'] = [sqlCondition, value];
        } else {
          filters[fieldname] = [sqlCondition, value];
        }
      }

      this.$emit('change', JSON.parse(JSON.stringify(filters)));
      this.filters = this.cloneFilters(this.newFilters);
    },
  },
});
</script>
