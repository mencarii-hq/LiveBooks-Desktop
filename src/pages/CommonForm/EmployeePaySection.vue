<template>
  <div v-if="showSection">
    <div class="flex justify-between items-center select-none mb-4">
      <h2 class="text-base text-gray-900 dark:text-gray-25 font-semibold">
        {{ t`Pay` }}
      </h2>
    </div>

    <div v-if="loading" class="text-sm text-gray-600 dark:text-gray-300">
      {{ t`Loading…` }}
    </div>

    <div v-else-if="profile" class="grid gap-4 gap-x-8 grid-cols-2">
      <div
        v-for="field of scalarFields"
        :key="field.fieldname"
        :class="field.fieldtype === 'Check' ? 'mt-auto' : 'mb-auto'"
      >
        <FormControl
          :show-label="true"
          :border="true"
          :df="field"
          :read-only="evaluateReadOnly(field, profile)"
          :value="profile[field.fieldname]"
          @change="(value) => onValueChange(field, value)"
        />
        <div v-if="errors[field.fieldname]" class="text-sm text-red-600 mt-1">
          {{ errors[field.fieldname] }}
        </div>
      </div>

      <div v-if="deductionsField" class="col-span-2 text-base">
        <Table
          :show-label="true"
          :border="true"
          :df="deductionsField"
          :value="tableValue(profile.deductions)"
          @row-change="onRowChange"
        />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { DocValue } from 'fyo/core/types';
import { Doc } from 'fyo/model/doc';
import { ModelNameEnum } from 'models/types';
import { isWorkforcePartyRole, PartyRole } from 'models/baseModels/Party/types';
import { Field } from 'schemas/types';
import FormControl from 'src/components/Controls/FormControl.vue';
import Table from 'src/components/Controls/Table.vue';
import { handleErrorWithDialog } from 'src/errorHandling';
import { getErrorMessage } from 'src/utils';
import { evaluateReadOnly } from 'src/utils/doc';
import { generateDocId } from 'utils/ids';
import { computed, PropType, defineComponent } from 'vue';

const PAY_FIELDNAMES = [
  'payType',
  'rate',
  'expenseAccount',
  'disabled',
] as const;

type PreSyncDoc = Doc & {
  _preSync: () => Promise<void>;
  _setBaseMetaValues: () => void;
  _updateModifiedMetaValues: () => void;
  _touchDirtyChildModifiedMeta: () => void;
};

export default defineComponent({
  name: 'EmployeePaySection',
  components: { FormControl, Table },
  provide() {
    // Table/FormControl inject `doc` for append/remove/filters — must be the
    // PayrollProfile, not the Party from CommonForm.
    return {
      doc: computed(() => this.profile),
    };
  },
  props: {
    partyDoc: { type: Object as PropType<Doc>, required: true },
  },
  data() {
    return {
      profile: null as Doc | null,
      loading: false,
      errors: {} as Record<string, string>,
      loadToken: 0,
      partyWasNew: false,
      onPartyBeforeSync: null as null | (() => Promise<void>),
      onPartyAfterSync: null as null | (() => Promise<void>),
    };
  },
  computed: {
    showSection(): boolean {
      return isWorkforcePartyRole(this.partyDoc.role as PartyRole);
    },
    scalarFields(): Field[] {
      return PAY_FIELDNAMES.map((fieldname) =>
        this.fyo.getField(ModelNameEnum.PayrollProfile, fieldname)
      ).filter((f): f is Field => !!f);
    },
    deductionsField(): Field | null {
      return (
        this.fyo.getField(ModelNameEnum.PayrollProfile, 'deductions') ?? null
      );
    },
  },
  watch: {
    'partyDoc.role'() {
      void this.loadProfile();
    },
    // Reload from DB once Party lands; avoid watching `name` — ensurePartyName
    // assigns a UUID and would race-recreate the in-memory stub.
    'partyDoc.notInserted'(notInserted: boolean, wasNotInserted: boolean) {
      if (wasNotInserted && !notInserted) {
        void this.loadProfile();
      }
    },
  },
  mounted() {
    // Couples pay to Party save (Save button + keyboard shortcut via doc.sync).
    this.onPartyBeforeSync = () => this.handlePartyBeforeSync();
    this.onPartyAfterSync = () => this.handlePartyAfterSync();
    this.partyDoc.on('beforeSync', this.onPartyBeforeSync);
    this.partyDoc.on('afterSync', this.onPartyAfterSync);
    void this.loadProfile();
  },
  unmounted() {
    if (this.onPartyBeforeSync) {
      this.partyDoc.off('beforeSync', this.onPartyBeforeSync);
    }
    if (this.onPartyAfterSync) {
      this.partyDoc.off('afterSync', this.onPartyAfterSync);
    }
  },
  methods: {
    evaluateReadOnly,
    tableValue(value: unknown): unknown[] {
      return Array.isArray(value) ? value : [];
    },
    /** Stable Party PK so an in-memory profile can link before first save. */
    ensurePartyName(): string {
      if (!this.partyDoc.name) {
        this.partyDoc.name = generateDocId();
      }
      return this.partyDoc.name;
    },
    async linkProfileParty() {
      if (!this.profile) {
        return;
      }
      const party = this.ensurePartyName();
      if (this.profile.party !== party) {
        await this.profile.set('party', party);
      }
    },
    /**
     * Validate dirty pay before Party is written. Throws to abort Party sync
     * so invalid pay never leaves an orphan employee row.
     */
    async handlePartyBeforeSync() {
      this.partyWasNew = this.partyDoc.notInserted;
      if (!this.showSection || !this.profile?.dirty) {
        return;
      }

      await this.linkProfileParty();
      // _preSync validates required meta (Created/Modified/…). Those are
      // normally stamped in Doc._insert/_update before _preSync — stamp here
      // too so this early validate path does not false-fail.
      const profile = this.profile as PreSyncDoc;
      if (profile.notInserted) {
        profile._setBaseMetaValues();
      } else {
        profile._updateModifiedMetaValues();
      }
      profile._touchDirtyChildModifiedMeta();
      await profile._preSync();
    },
    /**
     * Persist pay after Party succeeds. On create, roll Party back if pay
     * sync fails so the form stays one transactional unit.
     */
    async handlePartyAfterSync() {
      if (!this.showSection) {
        return;
      }

      const wasNew = this.partyWasNew;
      this.partyWasNew = false;

      if (!this.profile) {
        await this.loadProfile();
      }

      if (!this.profile?.dirty) {
        return;
      }

      try {
        await this.linkProfileParty();
        await this.profile.sync();
      } catch (error) {
        if (wasNew) {
          await this.rollbackParty();
        }
        await handleErrorWithDialog(error as Error, this.profile ?? undefined);
        // Reject Party sync so callers don't toast success after a rollback.
        throw error;
      }
    },
    async rollbackParty() {
      try {
        if (this.partyDoc.inserted && this.partyDoc.canDelete) {
          await this.partyDoc.delete();
        }
      } catch {
        // Best-effort; pay error is already surfaced to the user.
      }

      // delete() does not restore insert state — put the form back to editable.
      this.partyDoc._notInserted = true;
      this.partyDoc._dirty = true;
      await this.linkProfileParty();
      if (this.profile) {
        this.profile._dirty = true;
      }
    },
    async loadProfile() {
      if (!this.showSection) {
        this.profile = null;
        return;
      }

      const token = ++this.loadToken;
      this.loading = true;
      try {
        const party = this.ensurePartyName();

        if (!this.partyDoc.notInserted) {
          const existing = (await this.fyo.db.getAll(
            ModelNameEnum.PayrollProfile,
            {
              fields: ['name'],
              filters: { party },
            }
          )) as { name: string }[];

          if (token !== this.loadToken) {
            return;
          }

          if (existing.length) {
            this.profile = await this.fyo.doc.getDoc(
              ModelNameEnum.PayrollProfile,
              existing[0].name
            );
            return;
          }
        }

        if (token !== this.loadToken) {
          return;
        }

        // Keep an existing in-memory stub across Party name watches when possible.
        if (this.profile?.notInserted) {
          await this.linkProfileParty();
          return;
        }

        const doc = this.fyo.doc.getNewDoc(ModelNameEnum.PayrollProfile, {
          party,
        });
        // Untouched pay is optional — don't write a blank profile on Party save.
        doc._dirty = false;
        this.profile = doc;
      } finally {
        if (token === this.loadToken) {
          this.loading = false;
        }
      }
    },
    async onValueChange(field: Field, value: DocValue) {
      if (!this.profile) {
        return;
      }

      delete this.errors[field.fieldname];
      try {
        await this.profile.set(field.fieldname, value);
      } catch (err) {
        if (err instanceof Error) {
          this.errors[field.fieldname] = getErrorMessage(err, this.profile);
        }
      }
    },
    onRowChange() {
      if (this.profile && !this.profile.dirty) {
        this.profile._dirty = true;
      }
    },
    /**
     * Optional explicit save from CommonForm; afterSync is the primary path
     * (covers keyboard shortcuts that call doc.sync directly).
     */
    async savePaySetup(): Promise<boolean> {
      if (!this.showSection || this.partyDoc.notInserted || !this.profile) {
        return true;
      }
      if (!this.profile.dirty) {
        return true;
      }

      try {
        await this.linkProfileParty();
        await this.profile.sync();
        return true;
      } catch (error) {
        await handleErrorWithDialog(error as Error, this.profile);
        return false;
      }
    },
  },
});
</script>
