<template>
  <div class="p-4 overflow-auto custom-scroll custom-scroll-thumb1">
    <h2 class="text-base text-gray-900 dark:text-gray-25 font-semibold mb-1">
      {{ t`Check Printing` }}
    </h2>
    <p class="text-sm text-gray-600 dark:text-gray-400 mb-4 max-w-2xl">
      {{
        t`Calibrate each check format independently. Print a sample on your check stock, then nudge fields in 1/100 inch steps until they line up. In the print dialog, turn off "Fit to page" / scaling. Recalibrate after switching printers.`
      }}
    </p>

    <!-- Format picker -->
    <div class="flex items-center gap-3 mb-4">
      <label class="text-sm text-gray-700 dark:text-gray-300 w-32">
        {{ t`Check format` }}
      </label>
      <select
        v-model="format"
        class="
          text-sm
          border
          rounded
          px-2
          py-1.5
          bg-gray-25
          dark:bg-gray-850 dark:text-gray-25
        "
      >
        <option v-for="f in formats" :key="f.value" :value="f.value">
          {{ f.label }}
        </option>
      </select>
    </div>

    <template v-if="profile">
      <!-- Page size (Q-H per-format) -->
      <div class="grid grid-cols-2 gap-4 max-w-md mb-6">
        <div>
          <div class="text-xs text-gray-600 dark:text-gray-400 mb-1">
            {{ t`Page width (in)` }}
          </div>
          <input
            v-model.number="profile.pageWidthIn"
            type="number"
            step="0.01"
            min="1"
            class="
              w-full
              text-sm
              border
              rounded
              px-2
              py-1.5
              bg-gray-25
              dark:bg-gray-850 dark:text-gray-25
            "
          />
        </div>
        <div>
          <div class="text-xs text-gray-600 dark:text-gray-400 mb-1">
            {{ t`Page height (in)` }}
          </div>
          <input
            v-model.number="profile.pageHeightIn"
            type="number"
            step="0.01"
            min="1"
            class="
              w-full
              text-sm
              border
              rounded
              px-2
              py-1.5
              bg-gray-25
              dark:bg-gray-850 dark:text-gray-25
            "
          />
        </div>
      </div>

      <!-- Global offset -->
      <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-25 mb-2">
        {{ t`Global offset (1/100 inch)` }}
      </h3>
      <div class="flex gap-8 mb-6">
        <NudgeControl
          :label="t`Horizontal (X)`"
          :value="profile.offsetX"
          @change="(v) => (profile.offsetX = v)"
        />
        <NudgeControl
          :label="t`Vertical (Y)`"
          :value="profile.offsetY"
          @change="(v) => (profile.offsetY = v)"
        />
      </div>

      <!-- Per-field offsets -->
      <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-25 mb-2">
        {{ t`Per-field offsets (1/100 inch)` }}
      </h3>
      <div class="mb-6 space-y-3">
        <div
          v-for="fieldName in fieldNames"
          :key="fieldName"
          class="flex items-center gap-6 border-b dark:border-gray-800 pb-2"
        >
          <div class="w-32 text-sm text-gray-700 dark:text-gray-300 capitalize">
            {{ fieldName }}
          </div>
          <NudgeControl
            :label="t`X`"
            :value="fieldOffset(fieldName).x"
            @change="(v) => setFieldOffset(fieldName, 'x', v)"
          />
          <NudgeControl
            :label="t`Y`"
            :value="fieldOffset(fieldName).y"
            @change="(v) => setFieldOffset(fieldName, 'y', v)"
          />
        </div>
      </div>

      <!-- Actions -->
      <div class="flex flex-wrap gap-3 mt-4">
        <Button @click="printSample">{{ t`Print calibration sample` }}</Button>
        <Button @click="savePdfSample">{{ t`Save sample as PDF` }}</Button>
        <Button type="primary" :disabled="saving" @click="save">
          {{ saving ? t`Saving…` : t`Save calibration` }}
        </Button>
      </div>
    </template>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import Button from 'src/components/Button.vue';
import { fyo } from 'src/initFyo';
import { showToast } from 'src/utils/interactive';
import {
  loadCheckSettings,
  saveCheckSettings,
  printCalibrationSample,
} from 'src/utils/checkPrint/printChecks';
import { getDefaultProfiles } from 'src/utils/checkPrint/offsets';
import { CHECK_FIELD_NAMES } from 'src/utils/checkPrint/types';
import type {
  CheckFieldName,
  CheckFormat,
  CheckProfile,
  FieldOffset,
} from 'src/utils/checkPrint/types';

const NudgeControl = defineComponent({
  name: 'NudgeControl',
  props: {
    label: { type: String, default: '' },
    value: { type: Number, default: 0 },
  },
  emits: ['change'],
  methods: {
    bump(delta: number) {
      this.$emit('change', (Number(this.value) || 0) + delta);
    },
  },
  template: `
    <div class="flex flex-col">
      <span class="text-xs text-gray-600 dark:text-gray-400 mb-1">{{ label }}</span>
      <div class="flex items-center gap-2">
        <button class="px-2 py-0.5 border rounded text-sm" @click="bump(-1)">-</button>
        <span class="w-10 text-center text-sm tabular-nums">{{ value }}</span>
        <button class="px-2 py-0.5 border rounded text-sm" @click="bump(1)">+</button>
      </div>
    </div>
  `,
});

export default defineComponent({
  name: 'CheckPrintSettings',
  components: { Button, NudgeControl },
  data() {
    return {
      format: 'voucher' as CheckFormat,
      profiles: getDefaultProfiles(),
      saving: false,
      fieldNames: CHECK_FIELD_NAMES,
      formats: [
        { value: 'voucher', label: this.t`Voucher (1 per page)` },
        { value: 'threePerPage', label: this.t`3 per page` },
        { value: 'ledgerStub', label: this.t`Ledger / stub` },
      ],
    };
  },
  computed: {
    profile(): CheckProfile | null {
      return this.profiles[this.format] ?? null;
    },
  },
  async mounted() {
    const settings = await loadCheckSettings(fyo);
    this.format = settings.activeFormat;
    this.profiles = settings.profiles;
  },
  methods: {
    fieldOffset(fieldName: CheckFieldName): FieldOffset {
      const p = this.profile;
      if (!p) {
        return { x: 0, y: 0 };
      }
      if (!p.fields[fieldName]) {
        p.fields[fieldName] = { x: 0, y: 0 };
      }
      return p.fields[fieldName]!;
    },
    setFieldOffset(fieldName: CheckFieldName, axis: 'x' | 'y', value: number) {
      const offset = this.fieldOffset(fieldName);
      offset[axis] = Number(value) || 0;
    },
    async save() {
      this.saving = true;
      try {
        await saveCheckSettings(fyo, {
          activeFormat: this.format,
          profiles: this.profiles,
        });
        showToast({ type: 'success', message: this.t`Calibration saved` });
      } catch (error) {
        showToast({
          type: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        this.saving = false;
      }
    },
    async printSample() {
      if (!this.profile) {
        return;
      }
      await printCalibrationSample(this.format, this.profile);
    },
    async savePdfSample() {
      if (!this.profile) {
        return;
      }
      await printCalibrationSample(this.format, this.profile, { asPdf: true });
    },
  },
});
</script>
