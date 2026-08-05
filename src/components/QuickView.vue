<template>
  <div style="min-width: 192px; max-width: 300px">
    <div
      class="p-2 flex justify-between gap-2"
      :class="values.length ? 'border-b dark:border-gray-800' : ''"
    >
      <p
        v-if="displayTitle"
        class="
          font-semibold
          text-base text-gray-900
          dark:text-gray-25
          min-w-0
          break-words
        "
      >
        {{ displayTitle }}
      </p>
      <p
        class="
          font-semibold
          text-base text-gray-600
          dark:text-gray-300
          shrink-0
        "
      >
        {{ schema?.label ?? '' }}
      </p>
    </div>
    <div v-if="values.length" class="flex gap-2 p-2 flex-wrap">
      <p
        v-for="v of values"
        :key="v.label"
        class="pill bg-gray-200 dark:bg-gray-800"
      >
        <span class="text-gray-600 dark:text-gray-500">{{ v.label }}</span>
        <span class="text-gray-800 dark:text-gray-300 ml-1.5">{{
          v.value
        }}</span>
      </p>
    </div>
  </div>
</template>
<script lang="ts">
import { isFalsy } from 'fyo/utils';
import { Field, FieldTypeEnum } from 'schemas/types';
import { accountDisplayName } from 'utils/accountDisplay';
import { isUuidDocId } from 'utils/ids';
import { defineComponent } from 'vue';

export default defineComponent({
  props: {
    schemaName: { type: String, required: true },
    name: { type: String, required: true },
  },
  data() {
    return {
      values: [] as { label: string; value: string }[],
      displayTitle: '',
    };
  },
  computed: {
    schema() {
      return this.fyo.schemaMap[this.schemaName];
    },
  },
  watch: {
    async name(v1, v2) {
      if (v1 === v2) {
        return;
      }

      await this.setValues();
    },
  },
  async mounted() {
    await this.setValues();
  },
  methods: {
    async setValues() {
      const fields: Field[] = (this.schema?.fields ?? []).filter(
        (f) =>
          f &&
          f.fieldtype !== 'Table' &&
          f.fieldtype !== 'AttachImage' &&
          f.fieldtype !== 'Attachment' &&
          f.fieldname !== 'name' &&
          !f.hidden &&
          !f.meta &&
          !f.abstract &&
          !f.computed
      );

      const data = (
        await this.fyo.db.getAll(this.schemaName, {
          fields: fields.map((f) => f.fieldname),
          filters: { name: this.name },
        })
      )[0] as Record<string, unknown> | undefined;

      if (!data) {
        this.displayTitle = '';
        this.values = [];
        return;
      }

      const titleField =
        this.schema?.linkDisplayField || this.schema?.titleField;
      const titleValue = titleField
        ? String(data[titleField] ?? '').trim()
        : '';
      if (titleValue) {
        this.displayTitle = titleValue;
      } else if (this.schemaName === 'Account') {
        this.displayTitle = accountDisplayName({
          name: this.name,
          accountName: data.accountName as string | undefined,
        });
      } else if (
        this.schema?.naming !== 'random' &&
        !this.schema?.isChild &&
        !isUuidDocId(this.name)
      ) {
        this.displayTitle = this.name;
      } else {
        this.displayTitle = titleValue || '';
      }

      this.values = (
        await Promise.all(
          fields.map(async (f) => {
            const value = data[f.fieldname];
            if (isFalsy(value)) {
              return { value: '', label: '' };
            }

            let display = this.fyo.format(data[f.fieldname], f);
            if (
              (f.fieldtype === FieldTypeEnum.Link ||
                f.fieldtype === FieldTypeEnum.DynamicLink) &&
              typeof value === 'string'
            ) {
              const target =
                f.fieldtype === FieldTypeEnum.Link
                  ? f.target
                  : (data[f.references as string] as string | undefined);
              if (target === 'Account') {
                try {
                  const linked = (await this.fyo.db.get('Account', value)) as {
                    accountName?: string;
                  };
                  display = accountDisplayName({
                    name: value,
                    accountName: linked?.accountName,
                  });
                } catch {
                  /* keep formatted value */
                }
              }
            }

            return {
              value: display,
              label: f.label,
            };
          })
        )
      ).filter((i) => !!i.value);
    },
  },
});
</script>
