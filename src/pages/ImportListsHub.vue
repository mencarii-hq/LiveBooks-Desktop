<template>
  <div class="flex flex-col overflow-y-hidden">
    <PageHeader title="Import Lists from CSV" />
    <div
      class="
        flex-1
        overflow-y-auto overflow-x-hidden
        custom-scroll custom-scroll-thumb1
        p-4
      "
    >
      <p class="text-sm text-gray-700 dark:text-gray-200 mb-4 max-w-2xl">
        Use the Import Wizard to map columns from a CSV export (for example from
        QuickBooks or a spreadsheet) into LiveBooks records.
      </p>
      <Button type="primary" @click="openWizard"> Open Import Wizard </Button>

      <h2 class="mt-8 text-base font-medium dark:text-gray-25">
        Or open the wizard for a specific list
      </h2>
      <div class="flex flex-wrap gap-2 mt-3">
        <Button
          v-for="schemaName in importableNames"
          :key="schemaName"
          class="border dark:border-gray-800"
          @click="openWizardForType(schemaName)"
        >
          {{ labelFor(schemaName) }}
        </Button>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import Button from 'src/components/Button.vue';
import PageHeader from 'src/components/PageHeader.vue';
import { fyo } from 'src/initFyo';
import { getImportableSchemaNames } from 'src/utils/importableSchemas';
import { routeTo } from 'src/utils/ui';
import { ModelNameEnum } from 'models/types';
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'ImportListsHub',
  components: {
    PageHeader,
    Button,
  },
  computed: {
    importableNames(): ModelNameEnum[] {
      return getImportableSchemaNames(fyo);
    },
  },
  methods: {
    labelFor(schemaName: string): string {
      return fyo.schemaMap[schemaName]?.label ?? schemaName;
    },
    openWizard(): void {
      void routeTo('/import-wizard');
    },
    openWizardForType(schemaName: ModelNameEnum): void {
      void routeTo({
        path: '/import-wizard',
        query: { type: schemaName },
      });
    },
  },
});
</script>
