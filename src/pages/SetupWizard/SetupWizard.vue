<template>
  <FormContainer
    :show-header="false"
    class="justify-content items-center h-full"
    :class="{ 'window-drag': platform !== 'Windows' }"
  >
    <template #body>
      <FormHeader
        :form-title="t`Set up your organization`"
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

      <!-- Theme is the first required choice, then the rest of setup. -->
      <div
        v-if="hasDoc && step === 'theme'"
        class="
          overflow-auto
          custom-scroll custom-scroll-thumb1
          p-4
          flex flex-col
          gap-3
        "
      >
        <button
          v-for="option in themeOptions"
          :key="option.value"
          type="button"
          class="text-left rounded-lg border p-4 transition-colors"
          :class="
            selectedTheme === option.value
              ? 'border-green-600 bg-green-50 dark:bg-green-900/30 dark:border-green-500'
              : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-890'
          "
          :data-testid="`setup-theme-${option.value}`"
          @click="selectTheme(option.value)"
        >
          <p class="font-medium text-gray-900 dark:text-gray-100">
            {{ option.title }}
          </p>
          <p class="text-sm text-gray-600 dark:text-gray-300 mt-1">
            {{ option.hint }}
          </p>
        </button>
      </div>

      <!-- Section Container -->
      <div
        v-else-if="hasDoc"
        class="overflow-auto custom-scroll custom-scroll-thumb1"
      >
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
          :errors="errors"
          :collapsible="false"
          @value-change="onValueChange"
        />
      </div>

      <!-- Buttons Bar -->
      <div
        class="
          mt-auto
          p-4
          flex
          items-center
          justify-between
          border-t
          dark:border-gray-800
          flex-shrink-0
          sticky
          bottom-0
          bg-white
          dark:bg-gray-890
        "
      >
        <p v-if="loading" class="text-base text-gray-600 dark:text-gray-300">
          {{ t`Loading instance...` }}
        </p>
        <Button
          v-if="!loading && step === 'details'"
          class="w-24 border dark:border-gray-800"
          @click="step = 'theme'"
          >{{ t`Back` }}</Button
        >
        <Button
          v-else-if="!loading"
          class="w-24 border dark:border-gray-800"
          @click="cancel"
          >{{ t`Cancel` }}</Button
        >
        <Button
          v-if="step === 'theme'"
          type="primary"
          class="w-24"
          data-testid="theme-continue-button"
          :disabled="!selectedTheme"
          @click="step = 'details'"
          >{{ t`Continue` }}</Button
        >
        <Button
          v-else
          type="primary"
          class="w-24"
          data-testid="submit-button"
          :disabled="loading"
          @click="submit"
          >{{ t`Submit` }}</Button
        >
      </div>
    </template>
  </FormContainer>
</template>
<script lang="ts">
import { DocValue } from 'fyo/core/types';
import { Doc } from 'fyo/model/doc';
import { Verb } from 'fyo/telemetry/types';
import { TranslationString } from 'fyo/utils/translation';
import { ModelNameEnum } from 'models/types';
import { Field } from 'schemas/types';
import Button from 'src/components/Button.vue';
import FormContainer from 'src/components/FormContainer.vue';
import FormHeader from 'src/components/FormHeader.vue';
import { getErrorMessage } from 'src/utils';
import { showDialog } from 'src/utils/interactive';
import { getSetupWizardDoc } from 'src/utils/misc';
import { getFieldsGroupedByTabAndSection } from 'src/utils/ui';
import { computed, defineComponent } from 'vue';
import CommonFormSection from '../CommonForm/CommonFormSection.vue';

export default defineComponent({
  name: 'SetupWizard',
  components: {
    Button,
    FormContainer,
    FormHeader,
    CommonFormSection,
  },
  provide() {
    return {
      doc: computed(() => this.docOrNull),
    };
  },
  emits: ['setup-complete', 'setup-canceled'],
  data() {
    return {
      docOrNull: null,
      errors: {},
      loading: false,
      step: 'theme' as 'theme' | 'details',
    } as {
      errors: Record<string, string>;
      docOrNull: null | Doc;
      loading: boolean;
      step: 'theme' | 'details';
    };
  },
  computed: {
    themeOptions() {
      return [
        {
          value: 'classic' as const,
          title: this.t`Classic theme`,
          hint: this
            .t`For anyone comfortable keeping books on the desktop. Designed around a familiar workflow home page.`,
        },
        {
          value: 'modern' as const,
          title: this.t`Modern theme`,
          hint: this
            .t`The LiveBooks design — dashboard first, so you can focus on what matters.`,
        },
      ];
    },
    selectedTheme(): 'classic' | 'modern' | '' {
      if (!this.hasDoc) {
        return '';
      }
      const value = this.doc.desktopTheme;
      return value === 'classic' || value === 'modern' ? value : '';
    },
    hasDoc(): boolean {
      return this.docOrNull instanceof Doc;
    },
    doc(): Doc {
      if (this.docOrNull instanceof Doc) {
        return this.docOrNull;
      }

      throw new Error(`Doc is null`);
    },
    areAllValuesFilled(): boolean {
      if (!this.hasDoc) {
        return false;
      }

      const values = this.doc.schema.fields
        .filter((f) => f.required)
        .map((f) => this.doc[f.fieldname]);

      return values.every(Boolean);
    },
    activeGroup(): Map<string, Field[]> {
      if (!this.hasDoc) {
        return new Map();
      }

      const groupedFields = getFieldsGroupedByTabAndSection(
        this.doc.schema,
        this.doc
      );

      return [...groupedFields.values()][0];
    },
  },
  async mounted() {
    const languageMap = TranslationString.prototype.languageMap;
    this.docOrNull = getSetupWizardDoc(languageMap);
    if (!this.fyo.db.isConnected) {
      await this.fyo.db.init();
    }

    if (this.fyo.store.isDevelopment) {
      // @ts-ignore
      window.sw = this;
    }
    this.fyo.telemetry.log(Verb.Started, ModelNameEnum.SetupWizard);
  },
  methods: {
    async selectTheme(theme: 'classic' | 'modern') {
      if (!this.hasDoc) {
        return;
      }
      await this.doc.set('desktopTheme', theme);
    },
    async onValueChange(field: Field, value: DocValue) {
      if (!this.hasDoc) {
        return;
      }

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
    },
    async submit() {
      if (!this.hasDoc) {
        return;
      }

      if (!this.areAllValuesFilled) {
        return await showDialog({
          title: this.t`Mandatory Error`,
          detail: this.t`Please fill all values.`,
          type: 'error',
        });
      }

      this.loading = true;
      this.fyo.telemetry.log(Verb.Completed, ModelNameEnum.SetupWizard);
      this.$emit('setup-complete', this.doc.getValidDict());
    },
    cancel() {
      this.fyo.telemetry.log(Verb.Cancelled, ModelNameEnum.SetupWizard);
      this.$emit('setup-canceled');
    },
  },
});
</script>
