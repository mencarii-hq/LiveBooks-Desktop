<template>
  <div
    class="flex-1 flex justify-center items-center bg-gray-25 dark:bg-gray-900"
    :class="{
      'pointer-events-none': loadingDatabase,
      'window-drag': platform !== 'Windows',
    }"
    @dblclick="handleWindowDragDoubleClick"
  >
    <div
      class="
        w-full w-form
        shadow-lg
        rounded-lg
        border border-default
        relative
        bg-white
        dark:bg-gray-875
        window-no-drag
      "
      style="height: 700px"
    >
      <!-- Welcome -->
      <div class="px-4 py-4">
        <h1 class="text-2xl font-semibold select-none text-ink">
          {{ t`Welcome to LiveBooks Desktop` }}
        </h1>
        <p class="text-ink-muted text-base select-none">
          {{
            t`Create a new company or select an existing one from your computer`
          }}
        </p>
        <p class="text-ink-muted text-sm select-none mt-1">
          {{
            t`Your books stay on this computer. Online is for when your operations need it, after you open a company.`
          }}
        </p>
      </div>

      <hr class="border-default" />

      <!-- New File (Blue Icon) -->
      <div
        data-testid="create-new-file"
        class="px-4 h-row-largest flex flex-row items-center gap-4 p-2"
        :class="
          creatingDemo
            ? ''
            : 'hover:bg-gray-50 dark:hover:bg-gray-890 cursor-pointer'
        "
        @click="newDatabase"
      >
        <div class="w-8 h-8 rounded-full bg-green-600 relative flex-center">
          <feather-icon
            name="plus"
            class="text-white dark:text-gray-900 w-5 h-5"
          />
        </div>

        <div>
          <p class="font-medium dark:text-gray-100">
            {{ t`New Company` }}
          </p>
          <p class="text-sm text-gray-600 dark:text-gray-300">
            {{ t`Create a new company and store it on your computer` }}
          </p>
        </div>
      </div>

      <!-- Existing File (Green Icon) -->
      <div
        class="px-4 h-row-largest flex flex-row items-center gap-4 p-2"
        :class="
          creatingDemo
            ? ''
            : 'hover:bg-gray-50 dark:hover:bg-gray-890 cursor-pointer'
        "
        @click="existingDatabase"
      >
        <div
          class="
            w-8
            h-8
            rounded-full
            bg-gray-600
            dark:bg-gray-500
            relative
            flex-center
          "
        >
          <feather-icon
            name="upload"
            class="w-4 h-4 text-white dark:text-gray-900"
          />
        </div>
        <div>
          <p class="font-medium dark:text-gray-100">
            {{ t`Existing Company` }}
          </p>
          <p class="text-sm text-gray-600 dark:text-gray-300">
            {{ t`Load an existing company from your computer` }}
          </p>
        </div>
      </div>

      <!-- Create Demo (Pink Icon) — always available when enabled -->
      <div
        v-if="showDemoCompany"
        class="px-4 h-row-largest flex flex-row items-center gap-4 p-2"
        :class="
          creatingDemo
            ? ''
            : 'hover:bg-gray-50 dark:hover:bg-gray-890 cursor-pointer'
        "
        @click="createDemo"
      >
        <div
          class="
            w-8
            h-8
            rounded-full
            bg-pink-500
            dark:bg-pink-600
            relative
            flex-center
          "
        >
          <feather-icon name="monitor" class="w-4 h-4 text-white" />
        </div>
        <div>
          <p class="font-medium dark:text-gray-100">
            {{ t`Create Demo` }}
          </p>
          <p class="text-sm text-gray-600 dark:text-gray-300">
            {{ t`Create a demo company to try out LiveBooks Desktop` }}
          </p>
        </div>
      </div>
      <hr class="dark:border-gray-800" />

      <!-- File List -->
      <div class="overflow-y-auto" style="max-height: 340px">
        <div
          v-for="(file, i) in files"
          :key="file.dbPath"
          class="h-row-largest px-4 flex gap-4 items-center"
          :class="
            creatingDemo
              ? ''
              : 'hover:bg-gray-50 dark:hover:bg-gray-890 cursor-pointer'
          "
          :title="t`${file.companyName} stored at ${file.dbPath}`"
          @click="selectFile(file)"
        >
          <div
            class="
              w-8
              h-8
              rounded-full
              flex
              justify-center
              items-center
              bg-gray-200
              dark:bg-gray-800
              text-gray-500
              dark:text-gray-300
              font-semibold
              flex-shrink-0
              text-base
            "
          >
            {{ i + 1 }}
          </div>
          <div class="w-full">
            <div class="flex justify-between overflow-x-auto items-baseline">
              <h2 class="font-medium dark:text-gray-100">
                {{ file.companyName }}
              </h2>
              <p
                class="
                  whitespace-nowrap
                  text-sm text-gray-600
                  dark:text-gray-300
                "
              >
                {{ formatDate(file.modified) }}
              </p>
            </div>
            <p
              class="
                text-sm text-gray-600
                dark:text-gray-300
                overflow-x-auto
                no-scrollbar
                whitespace-nowrap
              "
            >
              {{ truncate(file.dbPath) }}
            </p>
          </div>
          <div class="ms-auto flex-shrink-0" @click.stop>
            <DropdownWithActions :actions="companyFileActions(file)" />
          </div>
        </div>
      </div>
      <hr v-if="files?.length" class="dark:border-gray-800" />

      <!-- Language Selector -->
      <!-- <div
        class="
          w-full
          flex
          justify-between
          items-center
          absolute
          p-4
          text-gray-900
          dark:text-gray-100
        "
        style="top: 100%; transform: translateY(-100%)"
      >
        <LanguageSelector v-show="!creatingDemo" class="text-sm w-28" />
        <button
          v-if="showDemoCompany && files?.length"
          class="
            text-sm
            bg-gray-100
            dark:bg-gray-700
            hover:bg-gray-200
            dark:hover:bg-gray-600
            rounded
            px-4
            py-1.5
            w-auto
            h-8
            no-scrollbar
            overflow-x-auto
            whitespace-nowrap
          "
          :disabled="creatingDemo"
          @click="createDemo"
        >
          {{ creatingDemo ? t`Please Wait` : t`Create Demo` }}
        </button>
      </div> -->
    </div>
    <Loading
      v-if="creatingDemo"
      :open="creatingDemo"
      :show-x="false"
      :full-width="true"
      :percent="creationPercent"
      :message="creationMessage"
    />

    <!-- Hard delete confirmation: type company name -->
    <Modal :open-modal="!!deleteTarget" @closemodal="closeDeleteConfirm">
      <div class="p-4 text-gray-900 dark:text-gray-100 w-form">
        <h2 class="text-xl font-semibold select-none">
          {{ t`Delete ${deleteTarget?.companyName}?` }}
        </h2>
        <p class="text-base mt-2">
          {{
            t`This permanently deletes the company file from disk. It cannot be undone.`
          }}
        </p>
        <p
          class="
            text-sm text-gray-600
            dark:text-gray-300
            mt-2
            break-all
            select-text
          "
        >
          {{ deleteTarget?.dbPath }}
        </p>
        <p class="text-sm text-red-600 dark:text-red-400 mt-4">
          {{ t`Type "${deleteTarget?.companyName}" to confirm.` }}
        </p>
        <input
          v-model="deleteConfirmName"
          type="text"
          class="
            mt-2
            w-full
            bg-gray-100
            dark:bg-gray-800
            focus:bg-gray-200
            dark:focus:bg-gray-700
            rounded-md
            px-2
            py-1.5
            outline-none
            text-base
          "
          :placeholder="deleteTarget?.companyName"
          @keydown.enter="confirmDelete"
        />
        <div class="flex justify-between mt-6">
          <Button @click="closeDeleteConfirm">{{ t`Cancel` }}</Button>
          <Button
            type="primary"
            :disabled="!canConfirmDelete"
            @click="confirmDelete"
          >
            {{ t`Delete Permanently` }}
          </Button>
        </div>
      </div>
    </Modal>

    <!-- Base Count Selection when Dev -->
    <Modal :open-modal="openModal" @closemodal="openModal = false">
      <div class="p-4 text-gray-900 dark:text-gray-100 w-form">
        <h2 class="text-xl font-semibold select-none">Set Base Count</h2>
        <p class="text-base mt-2">
          Base Count is a lower bound on the number of entries made when
          creating the dummy instance.
        </p>
        <div class="flex my-12 justify-center items-baseline gap-4 text-base">
          <label for="basecount" class="text-gray-600 dark:text-gray-300"
            >Base Count</label
          >
          <input
            v-model="baseCount"
            type="number"
            name="basecount"
            class="
              bg-gray-100
              dark:bg-gray-800
              focus:bg-gray-200
              dark:focus:bg-gray-700
              rounded-md
              px-2
              py-1
              outline-none
            "
          />
        </div>
        <div class="flex justify-between">
          <Button @click="openModal = false">Cancel</Button>
          <Button
            type="primary"
            @click="
              () => {
                openModal = false;
                startDummyInstanceSetup();
              }
            "
            >Create</Button
          >
        </div>
      </div>
    </Modal>
  </div>
</template>
<script lang="ts">
import { setupDummyInstance } from 'dummy';
import { t } from 'fyo';
import { Verb } from 'fyo/telemetry/types';
import { DateTime } from 'luxon';
import Button from 'src/components/Button.vue';
import DropdownWithActions from 'src/components/DropdownWithActions.vue';
import FeatherIcon from 'src/components/FeatherIcon.vue';
import Loading from 'src/components/Loading.vue';
import Modal from 'src/components/Modal.vue';
import { fyo } from 'src/initFyo';
import { handleErrorWithDialog } from 'src/errorHandling';
import { showToast } from 'src/utils/interactive';
import { updateConfigFiles } from 'src/utils/misc';
import { purgeCloudPlaidItemsForInstance } from 'src/utils/livebooksCloudBook';
import { attachDemoSourceBook } from 'src/utils/sourcebooks';
import {
  deleteDb,
  getSavePath,
  getSelectedFilePath,
  handleWindowDragDoubleClick,
} from 'src/utils/ui';
import { moveCompanyFile } from 'src/utils/companyDb';
import type { ConfigFilesWithModified } from 'utils/types';
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'DatabaseSelector',
  components: {
    Loading,
    FeatherIcon,
    Modal,
    Button,
    DropdownWithActions,
  },
  emits: ['file-selected', 'new-database'],
  data() {
    return {
      /** Set true to show demo company (USD, United States). */
      showDemoCompany: true,
      openModal: false,
      baseCount: 100,
      creationMessage: '',
      creationPercent: 0,
      creatingDemo: false,
      loadingDatabase: false,
      files: [],
      deleteTarget: null,
      deleteConfirmName: '',
    } as {
      showDemoCompany: boolean;
      openModal: boolean;
      baseCount: number;
      creationMessage: string;
      creationPercent: number;
      creatingDemo: boolean;
      loadingDatabase: boolean;
      files: ConfigFilesWithModified[];
      deleteTarget: ConfigFilesWithModified | null;
      deleteConfirmName: string;
    };
  },
  computed: {
    canConfirmDelete(): boolean {
      const target = this.deleteTarget;
      if (!target) {
        return false;
      }
      return this.deleteConfirmName.trim() === target.companyName;
    },
  },
  async mounted() {
    await this.setFiles();

    if (fyo.store.isDevelopment) {
      // @ts-ignore
      window.ds = this;
    }
  },
  methods: {
    handleWindowDragDoubleClick,
    truncate(value: string) {
      if (value.length < 72) {
        return value;
      }

      return '...' + value.slice(value.length - 72);
    },
    formatDate(isoDate: string) {
      return DateTime.fromISO(isoDate).toRelative();
    },
    companyFileActions(file: ConfigFilesWithModified) {
      return [
        {
          label: t`Move to`,
          action: async () => {
            const newPath = await moveCompanyFile(file.dbPath);
            if (newPath) {
              await this.setFiles();
            }
          },
        },
        {
          label: t`Delete`,
          component: {
            template:
              '<span class="text-red-600 dark:text-red-400">{{ t`Delete` }}</span>',
          },
          action: () => {
            this.openDeleteConfirm(file);
          },
        },
      ];
    },
    openDeleteConfirm(file: ConfigFilesWithModified) {
      this.deleteTarget = file;
      this.deleteConfirmName = '';
    },
    closeDeleteConfirm() {
      this.deleteTarget = null;
      this.deleteConfirmName = '';
    },
    async confirmDelete() {
      if (!this.canConfirmDelete || !this.deleteTarget) {
        return;
      }
      const file = this.deleteTarget;
      this.closeDeleteConfirm();

      const purge = await purgeCloudPlaidItemsForInstance(file.id);
      if (!purge.ok && !purge.skipped) {
        showToast({
          message:
            purge.error ??
            t`Could not disconnect bank feeds in LiveBooks Online. The local company file will still be deleted.`,
          type: 'warning',
        });
      }
      await deleteDb(file.dbPath);
      await this.setFiles();
    },
    async createDemo() {
      if (!fyo.store.isDevelopment) {
        await this.startDummyInstanceSetup();
      } else {
        this.openModal = true;
      }
    },
    async startDummyInstanceSetup() {
      const { filePath, canceled } = await getSavePath('demo', 'db');
      if (canceled || !filePath) {
        return;
      }

      this.creatingDemo = true;
      try {
        await setupDummyInstance(
          filePath,
          fyo,
          1,
          this.baseCount,
          (message, percent) => {
            this.creationMessage = message;
            this.creationPercent = percent;
          }
        );

        this.creationMessage = t`Seeding QBD Archive`;
        this.creationPercent = -1;
        const archive = await attachDemoSourceBook(filePath);
        if (!archive.ok) {
          showToast({
            message:
              archive.error ??
              t`Demo company was created, but the QBD Archive could not be attached.`,
            type: 'warning',
          });
        }

        updateConfigFiles(fyo);
        await fyo.purgeCache();
        await this.setFiles();
        this.fyo.telemetry.log(Verb.Created, 'dummy-instance');
        this.$emit('file-selected', filePath);
      } catch (error) {
        await handleErrorWithDialog(error, undefined, true, true);
      } finally {
        this.creatingDemo = false;
      }
    },
    async setFiles() {
      const dbList = await ipc.getDbList();
      this.files = dbList?.sort(
        (a, b) => Date.parse(b.modified) - Date.parse(a.modified)
      );
    },
    newDatabase() {
      if (this.creatingDemo) {
        return;
      }

      this.$emit('new-database');
    },
    async existingDatabase() {
      if (this.creatingDemo) {
        return;
      }

      const filePath = (await getSelectedFilePath())?.filePaths?.[0];
      this.emitFileSelected(filePath);
    },
    selectFile(file: ConfigFilesWithModified) {
      if (this.creatingDemo) {
        return;
      }

      this.emitFileSelected(file.dbPath);
    },
    emitFileSelected(filePath: string) {
      if (!filePath) {
        return;
      }

      this.$emit('file-selected', filePath);
    },
  },
});
</script>
