<template>
  <div class="p-4 border-b dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
    <label class="block text-sm text-gray-700 dark:text-gray-300 mb-2">
      {{ t`Smart Fill` }}
    </label>
    <textarea
      v-model="inputText"
      class="
        w-full
        resize-none
        rounded-md
        border
        dark:border-gray-700
        bg-white
        dark:bg-gray-850
        p-2
        text-sm
        custom-scroll custom-scroll-thumb2
      "
      rows="4"
      :placeholder="
        t`Paste a name and address (e.g. from Shopify). We'll fill the fields below.`
      "
      @paste="onPaste"
    />
    <div class="flex gap-2 mt-2">
      <Button type="primary" @click="applyFill">
        {{ t`Apply` }}
      </Button>
      <Button v-if="snapshot" @click="undoFill">
        {{ t`Undo fill` }}
      </Button>
    </div>
  </div>
</template>

<script lang="ts">
import { DocValue } from 'fyo/core/types';
import { Doc } from 'fyo/model/doc';
import { ModelNameEnum } from 'models/types';
import Button from 'src/components/Button.vue';
import { fyo } from 'src/initFyo';
import { showToast } from 'src/utils/interactive';
import {
  getCountryNameFromCode,
  parseSmartFill,
  SmartFillResult,
} from 'src/utils/smartFillParser';
import { defineComponent, PropType } from 'vue';

interface SmartFillSnapshot {
  name?: DocValue;
  email?: DocValue;
  phone?: DocValue;
  address?: DocValue;
  addressFields?: Record<string, DocValue>;
  createdAddressName?: string;
}

const REASON_MESSAGES = {
  empty: 'Nothing to fill',
  'no-anchor': 'Could not find a city, state, and postal code',
  'no-name': "First line doesn't look like a name",
} as const;

export default defineComponent({
  name: 'SmartFillBox',
  components: { Button },
  props: {
    doc: {
      type: Object as PropType<Doc>,
      required: true,
    },
  },
  emits: ['change'],
  data() {
    return {
      inputText: '',
      snapshot: null as SmartFillSnapshot | null,
    };
  },
  methods: {
    getDefaultCountry(): string | undefined {
      const countryCode = fyo.singles.SystemSettings?.countryCode as
        | string
        | undefined;
      return countryCode ? getCountryNameFromCode(countryCode) : undefined;
    },
    parseInput(text = this.inputText): SmartFillResult {
      return parseSmartFill(text, this.getDefaultCountry());
    },
    toastFailure(result: Extract<SmartFillResult, { ok: false }>) {
      showToast({
        type: 'warning',
        message: REASON_MESSAGES[result.reason],
      });
    },
    toastWarnings(warnings: string[]) {
      if (!warnings.length) {
        return;
      }

      showToast({
        type: 'warning',
        message: warnings.join(' — '),
      });
    },
    toastError(error: unknown) {
      const message =
        error instanceof Error ? error.message : this.t`Smart Fill failed`;
      showToast({
        type: 'error',
        message,
      });
    },
    notifyChange() {
      this.$emit('change');
    },
    async onPaste() {
      // Paste updates the textarea after the event; wait a tick so v-model is current.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      await this.runFill();
    },
    async applyFill() {
      await this.runFill();
    },
    async runFill() {
      const result = this.parseInput();
      if (!result.ok) {
        this.toastFailure(result);
        return;
      }

      try {
        await this.fillFromResult(result);
        this.notifyChange();
      } catch (error) {
        this.toastError(error);
      }
    },
    async fillFromResult(
      result: Extract<SmartFillResult, { ok: true }>
    ): Promise<void> {
      const nextSnapshot = this.snapshot ?? (await this.captureSnapshot());

      const values: Record<string, DocValue> = { name: result.name };
      if (result.email) {
        values.email = result.email;
      }
      if (result.phone) {
        values.phone = result.phone;
      }

      await this.doc.set(values);
      const createdAddressName = await this.fillAddress(result);

      this.snapshot = {
        ...nextSnapshot,
        createdAddressName:
          createdAddressName ?? nextSnapshot.createdAddressName,
      };
      this.toastWarnings(result.warnings);
    },
    async captureSnapshot(): Promise<SmartFillSnapshot> {
      const snapshot: SmartFillSnapshot = {
        name: this.doc.name as DocValue,
        email: this.doc.get('email') as DocValue,
        phone: this.doc.get('phone') as DocValue,
        address: this.doc.get('address') as DocValue,
      };

      const addressDoc = await this.doc.loadAndGetLink('address');
      if (addressDoc) {
        snapshot.addressFields = {
          name: addressDoc.name as DocValue,
          addressLine1: addressDoc.get('addressLine1') as DocValue,
          addressLine2: addressDoc.get('addressLine2') as DocValue,
          city: addressDoc.get('city') as DocValue,
          state: addressDoc.get('state') as DocValue,
          postalCode: addressDoc.get('postalCode') as DocValue,
          country: addressDoc.get('country') as DocValue,
        };
      }

      return snapshot;
    },
    async getUniqueAddressName(partyName: string): Promise<string> {
      let candidate = partyName;
      let suffix = 2;

      while (await fyo.db.exists(ModelNameEnum.Address, candidate)) {
        candidate = `${partyName} (${suffix})`;
        suffix += 1;
      }

      return candidate;
    },
    buildAddressValues(
      result: Extract<SmartFillResult, { ok: true }>
    ): Record<string, DocValue> {
      const addressValues: Record<string, DocValue> = {};
      if (result.address.addressLine1) {
        addressValues.addressLine1 = result.address.addressLine1;
      }
      if (result.address.addressLine2) {
        addressValues.addressLine2 = result.address.addressLine2;
      }
      if (result.address.city) {
        addressValues.city = result.address.city;
      }
      if (result.address.state) {
        addressValues.state = result.address.state;
      }
      if (result.address.postalCode) {
        addressValues.postalCode = result.address.postalCode;
      }
      if (result.address.country) {
        addressValues.country = result.address.country;
      }
      return addressValues;
    },
    async fillAddress(
      result: Extract<SmartFillResult, { ok: true }>
    ): Promise<string | undefined> {
      const addressValues = this.buildAddressValues(result);
      let addressDoc = await this.doc.loadAndGetLink('address');
      let createdAddressName: string | undefined;

      if (!addressDoc) {
        const addressName = await this.getUniqueAddressName(result.name);
        addressDoc = fyo.doc.getNewDoc(ModelNameEnum.Address, {
          name: addressName,
          ...addressValues,
        });

        // Only link after persist — an unsaved Address name breaks Party.address.
        const canSync =
          !!addressDoc.get('addressLine1') &&
          !!addressDoc.get('city') &&
          !!addressDoc.get('country');
        if (!canSync) {
          return undefined;
        }

        await addressDoc.sync();
        this.doc.links ??= {};
        this.doc.links.address = addressDoc;
        await this.doc.set('address', addressDoc.name as string);
        createdAddressName = addressDoc.name as string;
        return createdAddressName;
      }

      if (Object.keys(addressValues).length) {
        // Set country before state so state option lists resolve correctly.
        if (addressValues.country !== undefined) {
          await addressDoc.set('country', addressValues.country);
        }
        const { country: _country, ...rest } = addressValues;
        if (Object.keys(rest).length) {
          await addressDoc.set(rest);
        }
      }

      return undefined;
    },
    async undoFill() {
      if (!this.snapshot) {
        return;
      }

      try {
        const { snapshot } = this;

        // Restore linked address fields before clearing/changing the link.
        if (snapshot.addressFields && snapshot.address) {
          const addressDoc = await this.doc.loadAndGetLink('address');
          if (
            addressDoc &&
            addressDoc.name === snapshot.address &&
            !snapshot.createdAddressName
          ) {
            await addressDoc.set(snapshot.addressFields);
          }
        }

        const partyValues: Record<string, DocValue> = {};
        if (snapshot.name !== undefined) {
          partyValues.name = snapshot.name ?? null;
        }
        partyValues.email = snapshot.email ?? null;
        partyValues.phone = snapshot.phone ?? null;
        partyValues.address = snapshot.address ?? null;
        await this.doc.set(partyValues);

        if (snapshot.createdAddressName) {
          if (this.doc.links?.address?.name === snapshot.createdAddressName) {
            delete this.doc.links.address;
          }
          if (
            await fyo.db.exists(
              ModelNameEnum.Address,
              snapshot.createdAddressName
            )
          ) {
            const created = await fyo.doc.getDoc(
              ModelNameEnum.Address,
              snapshot.createdAddressName
            );
            await created.delete();
          }
        }

        this.snapshot = null;
        this.notifyChange();
      } catch (error) {
        this.toastError(error);
      }
    },
  },
});
</script>
