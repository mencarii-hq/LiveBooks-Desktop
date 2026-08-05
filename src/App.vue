<template>
  <div
    id="app"
    class="
      dark:bg-gray-900
      h-screen
      flex flex-col
      font-sans
      overflow-hidden
      antialiased
      relative
    "
    :dir="languageDirection"
    :language="language"
  >
    <WindowsTitleBar
      v-if="platform === 'Windows'"
      :db-path="dbPath"
      :company-name="companyName"
    />
    <!-- Main Contents -->
    <Desk
      v-if="activeScreen === 'Desk'"
      class="flex-1"
      :dark-mode="darkMode"
      @change-db-file="showDbSelector"
    />
    <DatabaseSelector
      v-if="activeScreen === 'DatabaseSelector'"
      ref="databaseSelector"
      @new-database="newDatabase"
      @file-selected="fileSelected"
    />
    <SetupWizard
      v-if="activeScreen === 'SetupWizard'"
      ref="setupWizard"
      @setup-complete="setupComplete"
      @setup-canceled="showDbSelector"
    />
    <LoadingWorkspaceOverlay :open="loadingWorkspace" />

    <!-- Render target for toasts -->
    <div
      id="toast-container"
      class="absolute bottom-0 flex flex-col items-end mb-3 pe-6"
      style="width: 100%; pointer-events: none"
    ></div>
  </div>
</template>
<script lang="ts">
import { RTL_LANGUAGES } from 'fyo/utils/consts';
import { ModelNameEnum } from 'models/types';
import { systemLanguageRef } from 'src/utils/refs';
import { defineComponent, nextTick, provide, ref, Ref } from 'vue';
import WindowsTitleBar from './components/WindowsTitleBar.vue';
import { handleErrorWithDialog } from './errorHandling';
import { fyo } from './initFyo';
import DatabaseSelector from './pages/DatabaseSelector.vue';
import Desk from './pages/Desk.vue';
import LoadingWorkspaceOverlay from './components/LoadingWorkspaceOverlay.vue';
import { startLivebooksSubscriptionPolling } from './utils/livebooksCloudSubscription';
import SetupWizard from './pages/SetupWizard/SetupWizard.vue';
import setupInstance from './setup/setupInstance';
import { SetupWizardOptions } from './setup/types';
import './styles/index.css';
import { connectToDatabase, dbErrorActionSymbols } from './utils/db';
import { initializeInstance } from './utils/initialization';
import * as injectionKeys from './utils/injectionKeys';
import { showDialog } from './utils/interactive';
import { updateConfigFiles } from './utils/misc';
import {
  markSetInitialScreenEnd,
  markSetInitialScreenStart,
  markWorkspaceReady,
} from './utils/bootPerformance';
import { updatePrintTemplates } from './utils/printTemplates';
import { Search } from './utils/search';
import { Shortcuts } from './utils/shortcuts';
import { routeTo } from './utils/ui';
import { useKeys } from './utils/vueUtils';
import { setDarkMode } from 'src/utils/theme';
import {
  isBootSplashVisible,
  releaseBootSplash,
  setBootSplashSubtitle,
  waitForNextPaint,
} from './bootSplash';
import { runWhenIdle } from './utils/runWhenIdle';
import {
  ensureFirstLaunchAt,
  maybePromptFeedbackSurvey,
} from './utils/feedbackSurvey';
import { getSavePath } from './utils/ui';
import { maybePromptMemorizedDue } from './utils/memorizedTransactions';
import {
  invalidateUsCaCompanyCache,
  REGIONAL_LABELS_CHANGED_EVENT,
} from 'utils/regional';
import {
  clearSavedLastRoute,
  enableRoutePersistence,
  getSavedLastRoute,
} from './router';

enum Screen {
  Desk = 'Desk',
  DatabaseSelector = 'DatabaseSelector',
  SetupWizard = 'SetupWizard',
}

export default defineComponent({
  name: 'App',
  components: {
    Desk,
    SetupWizard,
    DatabaseSelector,
    LoadingWorkspaceOverlay,
    WindowsTitleBar,
  },
  setup() {
    const keys = useKeys();
    const searcher: Ref<null | Search> = ref(null);
    const shortcuts = new Shortcuts(keys);
    const languageDirection = ref(
      getLanguageDirection(systemLanguageRef.value)
    );

    provide(injectionKeys.keysKey, keys);
    provide(injectionKeys.searcherKey, searcher);
    provide(injectionKeys.shortcutsKey, shortcuts);
    provide(injectionKeys.languageDirectionKey, languageDirection);

    const databaseSelector = ref<InstanceType<typeof DatabaseSelector> | null>(
      null
    );

    return {
      keys,
      searcher,
      shortcuts,
      languageDirection,
      databaseSelector,
    };
  },
  data() {
    return {
      activeScreen: null,
      dbPath: '',
      companyName: '',
      darkMode: false,
      loadingWorkspace: false,
    } as {
      activeScreen: null | Screen;
      dbPath: string;
      companyName: string;
      darkMode: boolean | undefined;
      loadingWorkspace: boolean;
      onRegionalLabelsChangedBound?: () => void;
    };
  },
  computed: {
    language(): string {
      return systemLanguageRef.value;
    },
  },
  watch: {
    language(value: string) {
      this.languageDirection = getLanguageDirection(value);
    },
  },
  async mounted() {
    markSetInitialScreenStart();
    const splashStarted = Date.now();
    let pendingDbPath: string | null = null;
    try {
      pendingDbPath = this.prepareInitialScreen();
    } catch {
      pendingDbPath = null;
    }

    // No saved company file → company select (never keep splash waiting).
    if (!pendingDbPath) {
      this.activeScreen = Screen.DatabaseSelector;
      await nextTick();
      await waitForNextPaint();
      await releaseBootSplash(0, splashStarted);
      markSetInitialScreenEnd();
    } else {
      // Keep HTML splash through auto-open/refresh so we don't flash the Vue
      // workspace overlay. fileSelected skips that overlay while splash is up.
      // Release before dialogs / selector / setup wizard (z-index traps them).
      setBootSplashSubtitle('Loading your workspace…');
      try {
        await this.fileSelected(pendingDbPath);
      } catch (error) {
        await releaseBootSplash(0, splashStarted);
        await handleErrorWithDialog(error, undefined, true, true);
        await this.showDbSelector();
      } finally {
        if (isBootSplashVisible()) {
          await nextTick();
          await waitForNextPaint();
          await releaseBootSplash(0, splashStarted);
        }
        markSetInitialScreenEnd();
        if (this.activeScreen === null) {
          this.activeScreen = Screen.DatabaseSelector;
        }
      }
    }

    runWhenIdle(() => {
      void startLivebooksSubscriptionPolling();
    });
    const darkMode = !!fyo.singles.SystemSettings?.darkMode;
    setDarkMode(darkMode);
    this.darkMode = darkMode;

    this.onRegionalLabelsChangedBound = () => {
      if (this.searcher) {
        this.searcher.refreshNonDocSearchList();
      }
    };
    document.addEventListener(
      REGIONAL_LABELS_CHANGED_EVENT,
      this.onRegionalLabelsChangedBound
    );
  },
  unmounted() {
    if (this.onRegionalLabelsChangedBound) {
      document.removeEventListener(
        REGIONAL_LABELS_CHANGED_EVENT,
        this.onRegionalLabelsChangedBound
      );
    }
  },
  methods: {
    prepareInitialScreen(): string | null {
      const lastSelectedFilePath = fyo.config.get('lastSelectedFilePath', null);

      if (
        typeof lastSelectedFilePath !== 'string' ||
        !lastSelectedFilePath.length
      ) {
        this.activeScreen = Screen.DatabaseSelector;
        return null;
      }

      // Keep selector as the fallback screen until Desk/SetupWizard takes over.
      this.activeScreen = Screen.DatabaseSelector;
      return lastSelectedFilePath;
    },
    async setSearcher(): Promise<void> {
      this.searcher = new Search(fyo);
      await this.searcher.initializeKeywords();
    },
    async setDesk(filePath: string): Promise<void> {
      this.activeScreen = Screen.Desk;
      await this.setDeskRoute();
      if (fyo.store.telemetryEnabled) {
        await fyo.telemetry.start(true);
      }
      this.dbPath = filePath;
      this.companyName = (await fyo.getValue(
        ModelNameEnum.AccountingSettings,
        'companyName'
      )) as string;
      updateConfigFiles(fyo);
      runWhenIdle(() => {
        void ipc.initLoyaltyExpiryJob();
      });
      if (fyo.store.updaterEnabled) {
        runWhenIdle(() => {
          void ipc.checkForUpdates();
        });
      }
      runWhenIdle(() => {
        void this.setSearcher();
      });
      runWhenIdle(() => {
        void maybePromptFeedbackSurvey(fyo);
      });
      runWhenIdle(() => {
        void fyo.telemetry.maybeSendFirstCompanyCreatePing();
      });
      runWhenIdle(() => {
        void maybePromptMemorizedDue(fyo);
      });
    },
    newDatabase() {
      this.activeScreen = Screen.SetupWizard;
    },
    async fileSelected(filePath: string): Promise<void> {
      const showWorkspaceOverlay =
        this.activeScreen !== Screen.Desk && !isBootSplashVisible();
      if (showWorkspaceOverlay) {
        this.loadingWorkspace = true;
      }

      try {
        await this.openSelectedDatabase(filePath);
      } finally {
        if (showWorkspaceOverlay) {
          this.loadingWorkspace = false;
        }
      }
    },
    async openSelectedDatabase(filePath: string): Promise<void> {
      fyo.config.set('lastSelectedFilePath', filePath);
      if (filePath !== ':memory:' && !(await ipc.checkDbAccess(filePath))) {
        // Dialogs are z-20; splash must go first or they look like a hang.
        await releaseBootSplash();
        await showDialog({
          title: this.t`Cannot open file`,
          type: 'error',
          detail: this
            .t`LiveBooks Desktop does not have access to the selected file: ${filePath}`,
        });

        fyo.config.set('lastSelectedFilePath', null);
        this.activeScreen = Screen.DatabaseSelector;
        return;
      }

      try {
        await this.showSetupWizardOrDesk(filePath);
      } catch (error) {
        await releaseBootSplash();
        await handleErrorWithDialog(error, undefined, true, true);
        await this.showDbSelector();
      }
    },
    async setupComplete(setupWizardOptions: SetupWizardOptions): Promise<void> {
      const wizard = this.$refs.setupWizard as
        | { loading?: boolean }
        | undefined;
      try {
        const companyName = setupWizardOptions.companyName;
        const defaultPath = await ipc.getDbDefaultPath(companyName);
        const { canceled, filePath } = await getSavePath(
          companyName,
          'db',
          defaultPath
        );
        if (canceled || !filePath) {
          if (wizard) {
            wizard.loading = false;
          }
          this.activeScreen = Screen.SetupWizard;
          return;
        }
        await setupInstance(filePath, setupWizardOptions, fyo);
        fyo.config.set('lastSelectedFilePath', filePath);
        ensureFirstLaunchAt(fyo);
        await this.setDesk(filePath);
        // Ping is scheduled from setDesk (idle retry). Do not await a second
        // send here — that raced the idle callback and could double-fire.
      } catch (error) {
        if (wizard) {
          wizard.loading = false;
        }
        await handleErrorWithDialog(error, undefined, true, true);
        this.activeScreen = Screen.SetupWizard;
      }
    },
    async showSetupWizardOrDesk(filePath: string): Promise<void> {
      const { countryCode, error, actionSymbol } = await connectToDatabase(
        this.fyo,
        filePath
      );

      if (!countryCode && error && actionSymbol) {
        return await this.handleConnectionFailed(error, actionSymbol);
      }

      const setupComplete = await fyo.getValue(
        ModelNameEnum.AccountingSettings,
        'setupComplete'
      );

      if (!setupComplete) {
        await releaseBootSplash();
        this.activeScreen = Screen.SetupWizard;
        return;
      }

      await initializeInstance(filePath, false, countryCode, fyo);
      await updatePrintTemplates(fyo);

      await this.setDesk(filePath);
    },
    async handleConnectionFailed(error: Error, actionSymbol: symbol) {
      await this.showDbSelector();

      if (actionSymbol === dbErrorActionSymbols.CancelSelection) {
        return;
      }

      if (actionSymbol === dbErrorActionSymbols.SelectFile) {
        await this.databaseSelector?.existingDatabase();
        return;
      }

      throw error;
    },
    async setDeskRoute(): Promise<void> {
      const { onboardingComplete } = await fyo.doc.getDoc('GetStarted');
      const { hideGetStarted } = await fyo.doc.getDoc('SystemSettings');

      // Use the boot-time snapshot — raw localStorage may already be `/`.
      const lastRoute = getSavedLastRoute();
      let route = '/get-started';
      if (lastRoute) {
        route = lastRoute;
      } else if (hideGetStarted || onboardingComplete) {
        route = '/';
      }

      // Allow persisting `/` and the restored route from here on.
      enableRoutePersistence();
      await routeTo(route);
      await nextTick();
      await waitForNextPaint();
      markWorkspaceReady();
    },
    async showDbSelector(): Promise<void> {
      await releaseBootSplash();
      invalidateUsCaCompanyCache();
      localStorage.clear();
      clearSavedLastRoute();
      fyo.config.set('lastSelectedFilePath', null);
      fyo.telemetry.stop();
      await fyo.purgeCache();
      this.activeScreen = Screen.DatabaseSelector;
      this.dbPath = '';
      this.searcher = null;
      this.companyName = '';
    },
  },
});

function getLanguageDirection(language: string): 'rtl' | 'ltr' {
  return RTL_LANGUAGES.includes(language) ? 'rtl' : 'ltr';
}
</script>
