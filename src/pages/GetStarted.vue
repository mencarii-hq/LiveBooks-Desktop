<template>
  <div class="flex flex-col overflow-y-hidden">
    <PageHeader :title="t`Set Up Your Workspace`">
      <p class="text-sm text-gray-600 dark:text-gray-400 select-none">
        {{ progressLabel }}
      </p>
    </PageHeader>
    <div
      class="
        flex-1
        overflow-y-auto overflow-x-hidden
        custom-scroll custom-scroll-thumb1
      "
    >
      <div class="p-4 flex flex-col gap-4">
        <section v-for="(section, sIndex) in sections" :key="section.label">
          <div
            class="
              flex
              items-center
              gap-2
              mb-2
              w-full
              text-left
              cursor-pointer
              select-none
            "
            role="button"
            tabindex="0"
            :aria-expanded="sectionOpen[sIndex]"
            @click="toggleSection(sIndex)"
            @keydown.enter.prevent="toggleSection(sIndex)"
            @keydown.space.prevent="toggleSection(sIndex)"
          >
            <svg
              class="
                w-4
                h-4
                flex-shrink-0
                text-gray-500
                dark:text-gray-400
                transition-transform
              "
              :class="{ 'rotate-90': sectionOpen[sIndex] }"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fill-rule="evenodd"
                d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                clip-rule="evenodd"
              />
            </svg>
            <h2 class="font-medium dark:text-gray-25">{{ section.label }}</h2>
            <span
              v-if="section.optional"
              class="
                text-xs
                px-1.5
                py-0.5
                rounded
                bg-gray-100
                text-gray-600
                dark:bg-gray-800 dark:text-gray-400
              "
            >
              {{ t`When needed` }}
            </span>
          </div>
          <div
            v-if="sectionOpen[sIndex]"
            class="border rounded-lg overflow-hidden dark:border-gray-800"
          >
            <div
              v-for="(item, index) in section.items"
              :key="item.key"
              class="flex items-center gap-3 px-3 py-2.5 dark:text-gray-50"
              :class="{
                'border-b dark:border-gray-800':
                  index < section.items.length - 1,
                'opacity-70': isCompleted(item),
              }"
            >
              <div
                class="
                  w-8
                  h-8
                  rounded-md
                  flex
                  items-center
                  justify-center
                  flex-shrink-0
                "
                :class="
                  isCompleted(item)
                    ? 'bg-green-50 dark:bg-green-900/30'
                    : 'bg-gray-100 dark:bg-gray-800'
                "
              >
                <Icon
                  v-if="isCompleted(item)"
                  name="green-check"
                  size="24"
                  class="w-5 h-5"
                />
                <Icon
                  v-else
                  :name="item.icon"
                  size="18"
                  :dark-mode="darkMode"
                />
              </div>
              <div class="flex-1 min-w-0">
                <h3 class="font-medium text-sm">{{ item.label }}</h3>
                <p
                  class="
                    mt-0.5
                    text-xs text-gray-600
                    dark:text-gray-400
                    truncate
                  "
                >
                  {{ item.description }}
                </p>
              </div>
              <div class="flex items-center gap-2 flex-shrink-0">
                <Button
                  v-if="item.action"
                  class="leading-tight text-sm"
                  :padding="false"
                  :type="isCompleted(item) ? 'secondary' : 'primary'"
                  :class="isCompleted(item) ? 'px-3' : 'px-4'"
                  @click="handleAction(item)"
                >
                  {{ actionLabel(item) }}
                </Button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { DocValue } from 'fyo/core/types';
import Button from 'src/components/Button.vue';
import Icon from 'src/components/Icon.vue';
import PageHeader from 'src/components/PageHeader.vue';
import { fyo } from 'src/initFyo';
import { getGetStartedConfig } from 'src/utils/getStartedConfig';
import {
  getLivebooksCloudSessionSummary,
  LIVEBOOKS_CLOUD_SESSION_APP_REFRESH_EVENT,
} from 'src/utils/livebooksCloud';
import { GetStartedConfigItem } from 'src/utils/types';
import { defineComponent } from 'vue';

type ListItem = GetStartedConfigItem['items'][number];

export default defineComponent({
  name: 'GetStarted',
  components: {
    PageHeader,
    Button,
    Icon,
  },
  props: {
    darkMode: { type: Boolean, default: false },
  },
  data() {
    const sections = getGetStartedConfig();
    return {
      sections,
      cloudSignedIn: false,
      onSessionRefresh: null as (() => void) | null,
      sectionOpen: sections.map(() => true),
      sectionTouched: sections.map(() => false),
    };
  },
  computed: {
    progressItems(): ListItem[] {
      return this.sections
        .flatMap((section) => section.items)
        .filter((item) => item.fieldname || item.completedKey);
    },
    completedCount(): number {
      return this.progressItems.filter((item) => this.isCompleted(item)).length;
    },
    totalCount(): number {
      return this.progressItems.length;
    },
    progressLabel(): string {
      return this.t`${this.completedCount} of ${this.totalCount} complete`;
    },
  },
  async mounted() {
    await this.refreshCloudSignedIn();
    this.onSessionRefresh = () => {
      void this.refreshCloudSignedIn();
    };
    document.addEventListener(
      LIVEBOOKS_CLOUD_SESSION_APP_REFRESH_EVENT,
      this.onSessionRefresh
    );
  },
  unmounted() {
    if (this.onSessionRefresh) {
      document.removeEventListener(
        LIVEBOOKS_CLOUD_SESSION_APP_REFRESH_EVENT,
        this.onSessionRefresh
      );
    }
  },
  async activated() {
    await fyo.doc.getDoc('GetStarted');
    await this.refreshCloudSignedIn();
    await this.checkForCompletedTasks();
    this.applyDefaultSectionOpen();
  },
  methods: {
    trackableItems(section: GetStartedConfigItem): ListItem[] {
      return section.items.filter(
        (item) => item.fieldname || item.completedKey
      );
    },
    isSectionComplete(section: GetStartedConfigItem): boolean {
      const items = this.trackableItems(section);
      if (!items.length) {
        return false;
      }
      return items.every((item) => this.isCompleted(item));
    },
    applyDefaultSectionOpen() {
      this.sectionOpen = this.sections.map((section, index) => {
        if (this.sectionTouched[index]) {
          return this.sectionOpen[index];
        }
        // Optional sections (Cloud) stay open even when signed in.
        if (section.optional) {
          return true;
        }
        return !this.isSectionComplete(section);
      });
    },
    toggleSection(index: number) {
      this.sectionTouched[index] = true;
      this.sectionOpen[index] = !this.sectionOpen[index];
    },
    actionLabel(item: ListItem): string {
      if (this.isCompleted(item)) {
        return item.viewLabel || this.t`View`;
      }
      return item.actionLabel || this.t`Set Up`;
    },
    async handleAction({ key, action }: ListItem) {
      if (action) {
        action();
      }

      switch (key) {
        case 'Print':
          await this.updateChecks({ printSetup: true });
          break;
        case 'General':
          await this.updateChecks({ companySetup: true });
          break;
        case 'Review Accounts':
          await this.updateChecks({ chartOfAccountsReviewed: true });
          break;
        case 'Opening Balances':
          await this.updateChecks({ openingBalanceChecked: true });
          break;
        case 'Add Taxes':
          await this.updateChecks({ taxesAdded: true });
          break;
      }
    },
    async refreshCloudSignedIn() {
      const { signedIn } = await getLivebooksCloudSessionSummary();
      this.cloudSignedIn = signedIn;
    },
    async checkIsOnboardingComplete() {
      if (fyo.singles.GetStarted?.onboardingComplete) {
        return true;
      }

      const doc = await fyo.doc.getDoc('GetStarted');
      const requiredFields = this.sections
        .filter((section) => !section.optional)
        .flatMap((section) => section.items)
        .map((item) => item.fieldname)
        .filter((fieldname): fieldname is string => Boolean(fieldname));
      const onboardingComplete =
        requiredFields.length > 0 &&
        requiredFields.every((fieldname) => doc.get(fieldname));

      if (onboardingComplete) {
        // Mark complete for checklist UI, but do not auto-hide Get Started —
        // demo data (and real DBs with items/invoices) would otherwise remove
        // Get Started / Import Lists from the sidebar immediately.
        await this.updateChecks({ onboardingComplete });
      }

      return onboardingComplete;
    },
    async checkForCompletedTasks() {
      let toUpdate: Record<string, DocValue> = {};
      if (await this.checkIsOnboardingComplete()) {
        return;
      }

      if (!fyo.singles.GetStarted?.salesItemCreated) {
        const count = await fyo.db.count('Item', { filters: { for: 'Sales' } });
        toUpdate.salesItemCreated = count > 0;
      }

      if (!fyo.singles.GetStarted?.purchaseItemCreated) {
        const count = await fyo.db.count('Item', {
          filters: { for: 'Purchases' },
        });
        toUpdate.purchaseItemCreated = count > 0;
      }

      if (!fyo.singles.GetStarted?.invoiceCreated) {
        const count = await fyo.db.count('SalesInvoice');
        toUpdate.invoiceCreated = count > 0;
      }

      if (!fyo.singles.GetStarted?.customerCreated) {
        const count = await fyo.db.count('Party', {
          filters: { role: 'Customer' },
        });
        toUpdate.customerCreated = count > 0;
      }

      if (!fyo.singles.GetStarted?.billCreated) {
        const count = await fyo.db.count('SalesInvoice');
        toUpdate.billCreated = count > 0;
      }

      if (!fyo.singles.GetStarted?.supplierCreated) {
        const count = await fyo.db.count('Party', {
          filters: { role: 'Supplier' },
        });
        toUpdate.supplierCreated = count > 0;
      }

      if (!fyo.singles.GetStarted?.openingBalanceChecked) {
        const count = await fyo.db.count('JournalEntry', {
          filters: { entryType: 'Opening Entry' },
        });
        toUpdate.openingBalanceChecked = count > 0;
      }
      await this.updateChecks(toUpdate);
    },
    async updateChecks(toUpdate: Record<string, DocValue>) {
      await fyo.singles.GetStarted?.setAndSync(toUpdate);
      await fyo.doc.getDoc('GetStarted');
    },
    isCompleted(item: ListItem) {
      if (item.completedKey === 'cloudSignedIn') {
        return this.cloudSignedIn;
      }

      if (!item.fieldname) {
        return false;
      }

      return fyo.singles.GetStarted?.get(item.fieldname) || false;
    },
  },
});
</script>
