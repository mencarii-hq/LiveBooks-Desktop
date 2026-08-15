<template>
  <div class="flex flex-col overflow-y-hidden h-full">
    <PageHeader :title="title" :border="true">
      <Button v-if="canCopy" type="primary" @click="copyToLive">
        {{ t`Copy to live books` }}
      </Button>
      <Button @click="goBack">{{ t`Back` }}</Button>
    </PageHeader>
    <SourceBooksBanner />

    <div
      class="
        flex-1
        overflow-y-auto overflow-x-hidden
        custom-scroll custom-scroll-thumb1
        p-4
      "
    >
      <p v-if="!detail" class="text-sm text-gray-500 dark:text-gray-400">
        {{ t`This record was not found in the archive index.` }}
      </p>

      <template v-else>
        <!-- Type + id strip -->
        <div class="flex flex-wrap items-center gap-2 mb-4 text-xs">
          <span
            class="
              rounded
              bg-gray-100
              dark:bg-gray-800
              px-2
              py-0.5
              text-gray-700
              dark:text-gray-200
              font-medium
            "
            >{{ typeLabel }}</span
          >
          <span class="text-gray-500 dark:text-gray-400">
            {{ detail.record.idKind === 'txn' ? t`TxnID` : t`ListID` }}:
            {{ detail.record.qbId ?? t`none` }}
          </span>
          <span
            v-if="detail.copiedTo"
            class="
              rounded
              bg-green-100
              dark:bg-green-900
              px-2
              py-0.5
              text-green-800
              dark:text-green-100
            "
          >
            {{ t`Copied to live books` }}
            <button class="underline ms-1" @click="openLiveCopy">
              {{ detail.copiedTo.targetName }}
            </button>
          </span>
        </div>

        <!-- Viewer -->
        <TypedViewer
          v-if="viewerConfig"
          :config="viewerConfig"
          :data="detail.data"
        />
        <GenericViewer v-else :data="detail.data" />

        <!-- Related documents (resolved by ListID/TxnID, never by name) -->
        <div v-if="relatedLinks.length" class="mt-8">
          <h4
            class="
              text-xs
              uppercase
              tracking-wide
              text-gray-500
              dark:text-gray-400
              mb-1
            "
          >
            {{ t`Related Documents` }}
          </h4>
          <div
            class="
              border
              dark:border-gray-800
              rounded
              divide-y
              dark:divide-gray-800
            "
          >
            <button
              v-for="(link, i) in relatedLinks"
              :key="i"
              class="
                flex
                w-full
                items-center
                justify-between
                gap-2
                px-3
                py-2
                text-sm text-start
                hover:bg-gray-50
                dark:hover:bg-gray-875
              "
              :disabled="!link.record"
              @click="openLink(link)"
            >
              <span class="dark:text-gray-100">
                <span class="font-medium">{{ linkTitle(link) }}</span>
                <span class="text-gray-500 dark:text-gray-400 ms-2">{{
                  linkSubtitle(link)
                }}</span>
              </span>
              <span class="text-xs text-gray-500 dark:text-gray-400">{{
                linkKindLabel(link)
              }}</span>
            </button>
          </div>
        </div>

        <!-- Raw Ret JSON -->
        <details class="mt-8">
          <summary
            class="cursor-pointer text-xs text-gray-500 dark:text-gray-400"
          >
            {{ t`Raw QBD data (JSON)` }}
          </summary>
          <pre
            class="
              mt-2
              max-h-96
              overflow-auto
              rounded
              border
              dark:border-gray-800
              bg-gray-50
              dark:bg-gray-875
              p-3
              text-xs
              dark:text-gray-200
            "
            >{{ rawJson }}</pre
          >
        </details>
      </template>
    </div>
  </div>
</template>

<script lang="ts">
import { t } from 'fyo';
import Button from 'src/components/Button.vue';
import PageHeader from 'src/components/PageHeader.vue';
import { showDialog, showToast } from 'src/utils/interactive';
import { getSourceBookRecord, sourceBookDocRoute } from 'src/utils/sourcebooks';
import { copyArchiveRecordToLive } from 'src/utils/sourcebooksCopy';
import { routeTo } from 'src/utils/ui';
import {
  entityTypeLabel,
  isCopyableEntityType,
} from 'utils/sourcebooks/entityTypes';
import type {
  SourceBookLink,
  SourceBookRecordDetail,
} from 'utils/sourcebooks/types';
import { defineComponent } from 'vue';
import SourceBooksBanner from './SourceBooksBanner.vue';
import GenericViewer from './viewers/GenericViewer.vue';
import TypedViewer from './viewers/TypedViewer.vue';
import { getViewerConfig, ViewerConfig } from './viewers/viewerConfigs';

export default defineComponent({
  name: 'SourceBooksDocument',
  components: {
    Button,
    GenericViewer,
    PageHeader,
    SourceBooksBanner,
    TypedViewer,
  },
  props: {
    kind: { type: String, required: true }, // 'id' | 'qb'
    value: { type: String, required: true },
  },
  data() {
    return {
      detail: null as SourceBookRecordDetail | null,
    };
  },
  computed: {
    title(): string {
      const record = this.detail?.record;
      if (!record) {
        return t`QBD Archive`;
      }
      return record.name ?? record.refNumber ?? this.typeLabel;
    },
    typeLabel(): string {
      return this.detail ? entityTypeLabel(this.detail.record.entityType) : '';
    },
    viewerConfig(): ViewerConfig | null {
      return this.detail
        ? getViewerConfig(this.detail.record.entityType)
        : null;
    },
    canCopy(): boolean {
      const record = this.detail?.record;
      if (!record || this.detail?.copiedTo) {
        return false;
      }
      if (record.entityType === 'customer' && record.parentId) {
        return false; // jobs are children — copy the parent customer
      }
      return isCopyableEntityType(record.entityType);
    },
    relatedLinks(): SourceBookLink[] {
      if (!this.detail) {
        return [];
      }
      // Parent/ref/txn links out, plus documents pointing here.
      return [...this.detail.outgoing, ...this.detail.incoming].filter(
        (link) => link.record
      );
    },
    rawJson(): string {
      return this.detail ? JSON.stringify(this.detail.data, null, 2) : '';
    },
  },
  watch: {
    value() {
      void this.fetchDetail();
    },
  },
  async mounted() {
    await this.fetchDetail();
  },
  methods: {
    t,
    async fetchDetail(): Promise<void> {
      const ref =
        this.kind === 'id' ? { id: Number(this.value) } : { qbId: this.value };
      this.detail = await getSourceBookRecord(ref);
    },
    linkTitle(link: SourceBookLink): string {
      const rec = link.record;
      if (!rec) {
        return link.qbId;
      }
      return rec.name ?? rec.refNumber ?? rec.qbId ?? '';
    },
    linkSubtitle(link: SourceBookLink): string {
      const rec = link.record;
      if (!rec) {
        return t`not in this archive`;
      }
      const parts = [entityTypeLabel(rec.entityType)];
      if (rec.txnDate) {
        parts.push(rec.txnDate);
      }
      return parts.join(' · ');
    },
    linkKindLabel(link: SourceBookLink): string {
      if (link.kind === 'parent') {
        return t`Parent`;
      }
      if (link.kind === 'applied_to_txn') {
        return t`Applied to`;
      }
      if (link.kind === 'linked_txn') {
        return t`Linked transaction`;
      }
      return (link.refField ?? t`Reference`)
        .replace(/_ref$/, '')
        .replace(/_/g, ' ');
    },
    openLink(link: SourceBookLink): void {
      if (!link.record) {
        return;
      }
      void routeTo(sourceBookDocRoute(link.record));
    },
    openLiveCopy(): void {
      const copied = this.detail?.copiedTo;
      if (!copied) {
        return;
      }
      void routeTo(
        `/edit/${copied.targetSchema}/${encodeURIComponent(copied.targetName)}`
      );
    },
    goBack(): void {
      this.$router.back();
    },
    async copyToLive(): Promise<void> {
      if (!this.detail) {
        return;
      }
      const label = this.typeLabel.toLowerCase();
      await showDialog({
        title: t`Copy this ${label} to your live books?`,
        detail: t`Creates an editable copy stamped "Copied from QuickBooks archive". Balances, inventory quantities, and payroll data are not copied.`,
        buttons: [
          {
            label: t`Copy`,
            isPrimary: true,
            action: async () => {
              const result = await copyArchiveRecordToLive(
                this.detail as SourceBookRecordDetail
              );
              if (!result.ok) {
                showToast({ type: 'error', message: result.error });
                return;
              }
              showToast({
                type: 'success',
                message: result.alreadyExisted
                  ? t`Already copied as ${result.name}`
                  : t`Copied to live books as ${result.name}`,
              });
              await this.fetchDetail();
            },
          },
          { label: t`Cancel`, action: () => null, isEscape: true },
        ],
      });
    },
  },
});
</script>
