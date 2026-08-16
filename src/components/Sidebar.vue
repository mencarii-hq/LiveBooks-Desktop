<template>
  <div
    class="sidebar-root py-2 h-full min-h-0 flex flex-col bg-green-700 relative"
    :class="{
      'window-drag': platform !== 'Windows',
    }"
    @dblclick="handleWindowDragDoubleClick"
  >
    <!-- Traffic-light / title-drag strip (must stay drag; nav below is no-drag for scroll) -->
    <div
      v-if="platform !== 'Windows'"
      class="window-drag shrink-0 w-full"
      :class="platform === 'Mac' && languageDirection === 'ltr' ? 'h-8' : 'h-2'"
      aria-hidden="true"
    />
    <!-- Nav must be no-drag + overflow so wheel/trackpad scroll works under app-region:drag -->
    <div
      class="flex-1 min-h-0 overflow-y-auto window-no-drag sidebar-nav-scroll"
    >
      <!-- Brand + company -->
      <div>
        <div
          data-testid="switch-company"
          class="
            text-base
            tracking-tight
            text-white
            flex
            items-center
            justify-center
            cursor-pointer
            hover:bg-green-800
            h-10
          "
          @click="$emit('change-db-file')"
        >
          {{ companyName }}
        </div>
        <hr class="border-white border-opacity-20 mx-4" />
      </div>

      <!-- Sidebar Items -->
      <div v-for="group in groups" :key="group.label">
        <div
          class="px-4 flex items-center cursor-pointer hover:bg-green-800 h-10"
          :class="
            isGroupActive(group) && !group.items
              ? 'bg-green-700 border-s-4 border-white'
              : ''
          "
          @click="routeToSidebarItem(group)"
          @contextmenu="onSidebarContextMenu($event, group)"
        >
          <Icon
            class="flex-shrink-0"
            :name="group.icon"
            :size="group.iconSize || '18'"
            :height="group.iconHeight ?? 4"
            :active="!!isGroupActive(group)"
            :darkMode="darkMode"
            :onPrimary="true"
            :class="isGroupActive(group) && !group.items ? '-ms-1' : ''"
          />
          <div
            class="ms-2 text-base"
            :class="
              isGroupActive(group) && !group.items
                ? 'text-white font-medium'
                : 'text-white'
            "
          >
            {{ group.label }}
          </div>
        </div>

        <!-- Expanded Group -->
        <div v-if="group.items && isGroupActive(group)">
          <div
            v-for="item in group.items"
            :key="item.name"
            class="
              text-base
              h-8
              cursor-pointer
              flex
              items-center
              hover:bg-green-800
            "
            :class="[
              isItemActive(item)
                ? 'bg-green-700 text-white border-s-4 border-white'
                : 'text-white',
              item.indent ? 'ps-16' : 'ps-10',
            ]"
            @click="routeToSidebarItem(item)"
            @contextmenu="onSidebarContextMenu($event, item)"
          >
            <p :style="isItemActive(item) ? 'margin-left: -4px' : ''">
              {{ item.label }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Report Issue and DB Switcher -->
    <div class="window-no-drag shrink-0 flex flex-col gap-2 px-4">
      <hr class="border-white border-opacity-20" />
      <div
        class="flex items-center gap-1 -mx-1 px-1 py-0.5"
        data-testid="sidebar-theme-toggle"
      >
        <button
          class="
            flex-1
            text-sm text-white
            rounded
            py-0.5
            px-1
            hover:bg-green-800
          "
          :class="
            desktopTheme === 'classic'
              ? 'bg-green-800 font-medium'
              : 'text-white/80'
          "
          type="button"
          :title="
            t`For anyone comfortable keeping books on the desktop. Designed around a familiar workflow home page.`
          "
          data-testid="sidebar-theme-classic"
          @click="setDesktopTheme('classic')"
        >
          {{ t`Classic` }}
        </button>
        <button
          class="
            flex-1
            text-sm text-white
            rounded
            py-0.5
            px-1
            hover:bg-green-800
          "
          :class="
            desktopTheme === 'modern'
              ? 'bg-green-800 font-medium'
              : 'text-white/80'
          "
          type="button"
          :title="
            t`The LiveBooks design — dashboard first, so you can focus on what matters.`
          "
          data-testid="sidebar-theme-modern"
          @click="setDesktopTheme('modern')"
        >
          {{ t`Modern` }}
        </button>
      </div>
      <button
        class="
          flex
          text-sm text-white
          hover:text-white hover:bg-green-800
          rounded
          gap-1
          items-center
          py-0.5
          -mx-1
          px-1
        "
        type="button"
        @click="giveFeedback"
      >
        <feather-icon name="message-circle" class="h-3 w-3 flex-shrink-0" />
        <p>
          {{ t`Give feedback` }}
        </p>
      </button>

      <button
        class="
          flex
          text-sm text-white
          hover:text-white hover:bg-green-800
          rounded
          gap-1
          items-center
          py-0.5
          -mx-1
          px-1
        "
        type="button"
        :title="livebooksCloudManageButtonTitle"
        @click="showLivebooksCloudModal = true"
      >
        <feather-icon
          :name="livebooksCloudManageButtonIcon"
          class="h-3 w-3 flex-shrink-0"
        />
        <p class="break-words">
          {{ t`Cloud` }}
        </p>
      </button>

      <!-- <button
        class="
          flex
          text-sm text-white
          hover:text-white
          hover:bg-green-800
          rounded
          gap-1
          items-center
          py-0.5
          -mx-1
          px-1
        "
        @click="viewShortcuts = true"
      >
        <feather-icon name="command" class="h-4 w-4 flex-shrink-0" />
        <p>{{ t`Shortcuts` }}</p>
      </button>
       -->
      <!-- <button
        class="
          flex
          text-sm text-white
          hover:text-white
          hover:bg-green-800
          rounded
          gap-1
          items-center
          py-0.5
          -mx-1
          px-1
        "
        @click="() => reportIssue()"
      >
        <feather-icon name="flag" class="h-4 w-4 flex-shrink-0" />
        <p>
          {{ t`Report Issue` }}
        </p>
      </button> -->

      <hr class="border-white border-opacity-20" />
      <div class="select-none">
        <p
          class="
            text-white text-base
            tracking-tight
            whitespace-normal
            break-words
          "
        >
          {{ livebooksDesktopBrandName }}
        </p>
      </div>
    </div>

    <!-- Hide Sidebar Button -->
    <!-- <button
      class="
        absolute
        bottom-0
        end-0
        text-white
        hover:bg-green-800
        hover:text-white
        rounded
        p-1
        m-4
        rtl-rotate-180
      "
      @click="() => toggleSidebar()"
    >
      <feather-icon name="chevrons-left" class="w-4 h-4" />
    </button> -->

    <Modal :open-modal="viewShortcuts" @closemodal="viewShortcuts = false">
      <ShortcutsHelper class="w-form" />
    </Modal>

    <Modal
      :open-modal="showLivebooksCloudModal"
      @closemodal="showLivebooksCloudModal = false"
    >
      <div
        class="
          w-full
          max-w-[var(--w-form)]
          min-w-0
          p-6
          pt-5
          pe-4
          flex flex-col
          gap-4
          text-gray-900
          dark:text-gray-100
        "
      >
        <div class="min-w-0 flex flex-col gap-2">
          <div class="flex items-start justify-between gap-3 min-w-0">
            <h2 class="text-lg font-semibold flex-1 min-w-0 pe-2">
              {{ t`LiveBooks Cloud` }}
            </h2>
            <button
              type="button"
              class="
                flex-shrink-0
                -mt-1
                -me-1
                p-1.5
                rounded-md
                text-gray-600
                dark:text-gray-300
                hover:bg-gray-200
                dark:hover:bg-gray-700
                hover:text-gray-900
                dark:hover:text-gray-100
              "
              :aria-label="t`Close`"
              @click="showLivebooksCloudModal = false"
            >
              <feather-icon name="x" class="w-5 h-5" />
            </button>
          </div>
          <p
            v-if="livebooksCloudSignedIn"
            class="
              text-sm text-gray-600
              dark:text-gray-300
              whitespace-normal
              break-words
            "
          >
            {{
              t`This computer is linked to your account. Open the website to manage billing and subscription, or
            disconnect this app below.`
            }}
          </p>
          <p
            v-else
            class="
              text-sm text-gray-600
              dark:text-gray-300
              whitespace-normal
              break-words
            "
          >
            {{
              t`Your books stay on this computer. LiveBooks Cloud is for when your operations need backup, sync, collaboration, and bank feeds. Sign in on the web to link this computer; keep this app open while you connect.`
            }}
          </p>
          <p
            v-if="secureStorageDegraded"
            class="
              text-sm text-amber-800
              dark:text-amber-200
              bg-amber-50
              dark:bg-amber-950/40
              border border-amber-200
              dark:border-amber-800
              rounded
              px-3
              py-2
              whitespace-normal
              break-words
            "
            role="status"
          >
            {{
              t`Secure storage is unavailable on this computer. Install or unlock a desktop keyring (GNOME Keyring or
            KWallet) to connect LiveBooks Cloud. Without it, this app cannot keep a Cloud session.`
            }}
          </p>
        </div>
        <div class="flex flex-col gap-2 min-w-0">
          <Button
            type="primary"
            class="w-full"
            @click="handleLivebooksCloudModalPrimary"
          >
            {{
              livebooksCloudSignedIn
                ? t`Open LiveBooks Cloud`
                : t`Explore Cloud`
            }}
          </Button>
          <Button
            v-if="!livebooksCloudSignedIn"
            class="w-full"
            @click="handleLivebooksCloudSignIn"
          >
            {{ t`Sign in` }}
          </Button>
          <Button
            v-if="!livebooksCloudSignedIn"
            class="w-full"
            @click="showLivebooksCloudModal = false"
          >
            {{ t`Use offline` }}
          </Button>
          <Button
            v-if="livebooksCloudSignedIn"
            type="secondary"
            class="w-full !text-red-600 dark:!text-red-400"
            @click="handleDisconnectLivebooksCloud"
          >
            {{ t`Disconnect this computer` }}
          </Button>
        </div>
      </div>
    </Modal>
  </div>
</template>
<script lang="ts">
import { t } from 'fyo';
import { handleErrorWithDialog, reportIssue } from 'src/errorHandling';
import { fyo } from 'src/initFyo';
import {
  DASHBOARD_PATH,
  HOME_PATH,
  getDesktopTheme,
  persistDesktopTheme,
  type DesktopTheme,
} from 'src/utils/qbdFamiliarity';
import { showDialog, showToast } from 'src/utils/interactive';
import {
  getLivebooksCloudSessionSummary,
  LIVEBOOKS_CLOUD_SESSION_APP_REFRESH_EVENT,
  openLivebooksCloudHome,
  openLivebooksCloudSignIn,
  signOutLivebooksCloud,
} from 'src/utils/livebooksCloud';
import {
  getLivebooksSubscriptionSnapshot,
  refreshLivebooksSubscription,
  subscribeLivebooksSubscription,
  type LivebooksSubscriptionSnapshot,
} from 'src/utils/livebooksCloudSubscription';
import { languageDirectionKey, shortcutsKey } from 'src/utils/injectionKeys';
import { docsPathRef } from 'src/utils/refs';
import { getSidebarConfig } from 'src/utils/sidebarConfig';
import { SidebarConfig, SidebarItem, SidebarRoot } from 'src/utils/types';
import {
  handleWindowDragDoubleClick,
  openRouteInSidePane,
  routeTo,
  routeToMain,
  toggleSidebar,
} from 'src/utils/ui';
import { showContextMenu } from 'src/utils/contextMenu';
import { openFeedbackSurvey } from 'src/utils/feedbackSurvey';
import { livebooksDesktopDisplayName } from 'utils/livebooksAppEnv';
import { REGIONAL_LABELS_CHANGED_EVENT } from 'utils/regional';
import { MEMORIZED_REPORTS_CHANGED_EVENT } from 'src/utils/memorizedReports';
import { SOURCEBOOKS_CHANGED_EVENT } from 'src/utils/sourcebooks';
import { defineComponent, inject } from 'vue';
import router from '../router';
import Button from './Button.vue';
import Icon from './Icon.vue';
import Modal from './Modal.vue';
import ShortcutsHelper from './ShortcutsHelper.vue';

const COMPONENT_NAME = 'Sidebar';

function sidebarFilterAllowsValue(
  filterValue: unknown,
  value: string
): boolean {
  if (filterValue == null) {
    return false;
  }
  if (typeof filterValue === 'string') {
    return filterValue === value;
  }
  if (
    Array.isArray(filterValue) &&
    filterValue[0] === 'in' &&
    Array.isArray(filterValue[1])
  ) {
    return (filterValue[1] as string[]).includes(value);
  }
  return false;
}

function matchPartyEditSidebarItem(
  item: SidebarItem,
  role: string,
  referrer: string
): boolean {
  if (!sidebarFilterAllowsValue(item.filters?.role, role)) {
    return false;
  }
  if (referrer) {
    return item.route === referrer;
  }
  if (role === 'Customer') {
    return item.name === 'customers';
  }
  if (role === 'Supplier') {
    return item.name === 'suppliers';
  }
  if (role === 'Both') {
    return item.name === 'party';
  }
  if (role === 'Employee' || role === 'Contractor') {
    return item.name === 'employees';
  }
  return false;
}

function matchItemEditSidebarItem(
  item: SidebarItem,
  forValue: string,
  referrer: string
): boolean {
  if (!sidebarFilterAllowsValue(item.filters?.['for'], forValue)) {
    return false;
  }
  if (referrer) {
    return item.route === referrer;
  }
  if (forValue === 'Sales') {
    return item.name === 'sales-items';
  }
  if (forValue === 'Purchases') {
    return item.name === 'purchase-items';
  }
  if (forValue === 'Both') {
    return item.name === 'common-items';
  }
  return false;
}

export default defineComponent({
  components: {
    Button,
    Icon,
    Modal,
    ShortcutsHelper,
  },
  props: {
    darkMode: { type: Boolean, default: false },
  },
  emits: ['change-db-file', 'toggle-darkmode'],
  setup() {
    return {
      languageDirection: inject(languageDirectionKey),
      shortcuts: inject(shortcutsKey),
      handleWindowDragDoubleClick,
    };
  },
  data() {
    return {
      companyName: '',
      groups: [],
      viewShortcuts: false,
      activeGroup: null,
      livebooksCloudSignedIn: false,
      livebooksCloudReachable: null as boolean | null,
      livebooksCloudSubscriptionStatus: null as string | null,
      secureStorageDegraded: false,
      showLivebooksCloudModal: false,
      livebooksCloudReachabilityDebounce: null as ReturnType<
        typeof setTimeout
      > | null,
      livebooksCloudReachabilityInterval: null as ReturnType<
        typeof setInterval
      > | null,
      onLivebooksCloudAppRefreshBound: null as (() => void) | null,
      onDocumentVisibilityBound: null as (() => void) | null,
      onRegionalLabelsChangedBound: null as (() => void) | null,
      unsubscribeLivebooksSubscription: null as (() => void) | null,
      // Payment name currently being loaded to resolve sidebar highlight.
      resolvingPaymentHighlight: '',
      // Party name currently being loaded to resolve sidebar highlight.
      resolvingPartyHighlight: '',
      // List path that opened the current Party edit (Customers vs Suppliers vs Common).
      lastPartyListPath: '',
      // Item name currently being loaded to resolve sidebar highlight.
      resolvingItemHighlight: '',
      // List path that opened the current Item edit (Sales vs Purchase vs Common).
      lastItemListPath: '',
      // SystemSettings is not Vue-reactive; keep the toggle in component state.
      appliedDesktopTheme: getDesktopTheme(fyo.singles.SystemSettings) as DesktopTheme,
    } as {
      companyName: string;
      groups: SidebarConfig;
      viewShortcuts: boolean;
      activeGroup: null | SidebarRoot;
      livebooksCloudSignedIn: boolean;
      livebooksCloudReachable: boolean | null;
      livebooksCloudSubscriptionStatus: string | null;
      secureStorageDegraded: boolean;
      showLivebooksCloudModal: boolean;
      livebooksCloudReachabilityDebounce: ReturnType<typeof setTimeout> | null;
      livebooksCloudReachabilityInterval: ReturnType<
        typeof setInterval
      > | null;
      onLivebooksCloudAppRefreshBound: (() => void) | null;
      onDocumentVisibilityBound: (() => void) | null;
      onRegionalLabelsChangedBound: (() => void) | null;
      unsubscribeLivebooksSubscription: (() => void) | null;
      resolvingPaymentHighlight: string;
      resolvingPartyHighlight: string;
      lastPartyListPath: string;
      resolvingItemHighlight: string;
      lastItemListPath: string;
      appliedDesktopTheme: DesktopTheme;
    };
  },
  computed: {
    appVersion() {
      return fyo.store.appVersion;
    },
    livebooksCloudShowProBranding(): boolean {
      if (!this.livebooksCloudSignedIn || this.livebooksCloudReachable !== true) {
        return false;
      }
      const status = this.livebooksCloudSubscriptionStatus;
      return status === 'active' || status === 'trialing';
    },
    livebooksCloudManageButtonIcon(): string {
      if (!this.livebooksCloudSignedIn) {
        return 'cloud';
      }
      if (this.livebooksCloudReachable === false) {
        return 'alert-triangle';
      }
      if (this.livebooksCloudReachable === null) {
        return 'cloud';
      }
      return 'check-circle';
    },
    livebooksDesktopBrandName(): string {
      return livebooksDesktopDisplayName(
        this.fyo.store.appEnv,
        this.livebooksCloudShowProBranding
      );
    },
    desktopTheme(): DesktopTheme {
      return this.appliedDesktopTheme;
    },
    livebooksCloudManageButtonTitle(): string {
      if (!this.livebooksCloudSignedIn) {
        return t`LiveBooks Cloud — backup, sync, and bank feeds when your operations need them`;
      }
      if (this.livebooksCloudReachable === false) {
        return t`LiveBooks Cloud — signed in, server unreachable`;
      }
      if (this.livebooksCloudReachable === null) {
        return t`LiveBooks Cloud — checking connection`;
      }
      return t`LiveBooks Cloud — connected`;
    },
  },
  async mounted() {
    const { companyName } = await fyo.doc.getDoc('AccountingSettings');
    this.companyName = companyName as string;
    this.groups = await getSidebarConfig();

    this.setActiveGroup();
    router.afterEach((to, from) => {
      const toPath = to.path;
      const fromPath = from.path;
      if (
        fromPath.startsWith('/list/Party') &&
        toPath.startsWith('/edit/Party')
      ) {
        this.lastPartyListPath = fromPath;
      } else if (!toPath.startsWith('/edit/Party')) {
        this.lastPartyListPath = '';
      }
      if (
        fromPath.startsWith('/list/Item') &&
        toPath.startsWith('/edit/Item')
      ) {
        this.lastItemListPath = fromPath;
      } else if (!toPath.startsWith('/edit/Item')) {
        this.lastItemListPath = '';
      }
      this.setActiveGroup();
    });

    this.shortcuts?.shift.set(COMPONENT_NAME, ['KeyH'], () => {
      if (document.body === document.activeElement) {
        this.toggleSidebar();
      }
    });
    this.shortcuts?.set(COMPONENT_NAME, ['F1'], () => this.openDocumentation());

    await this.refreshLivebooksCloudSignedIn();
    ipc.registerLivebooksCloudSessionListener(() => {
      void this.refreshLivebooksCloudSignedIn();
    });

    this.onLivebooksCloudAppRefreshBound = () => {
      void this.refreshLivebooksCloudSignedIn();
    };
    document.addEventListener(
      LIVEBOOKS_CLOUD_SESSION_APP_REFRESH_EVENT,
      this.onLivebooksCloudAppRefreshBound
    );

    this.onDocumentVisibilityBound = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }
      this.scheduleLivebooksCloudReachabilityRefresh();
    };
    document.addEventListener('visibilitychange', this.onDocumentVisibilityBound);

    this.onRegionalLabelsChangedBound = async () => {
      this.groups = await getSidebarConfig();
      this.setActiveGroup();
    };
    document.addEventListener(
      REGIONAL_LABELS_CHANGED_EVENT,
      this.onRegionalLabelsChangedBound
    );
    document.addEventListener(
      MEMORIZED_REPORTS_CHANGED_EVENT,
      this.onRegionalLabelsChangedBound
    );
    document.addEventListener(
      SOURCEBOOKS_CHANGED_EVENT,
      this.onRegionalLabelsChangedBound
    );

    this.unsubscribeLivebooksSubscription = subscribeLivebooksSubscription(
      (s) => this.applyLivebooksSubscriptionSnapshot(s)
    );

    this.livebooksCloudReachabilityInterval = setInterval(() => {
      if (document.hidden || !this.livebooksCloudSignedIn) {
        return;
      }
      void refreshLivebooksSubscription(true);
    }, 90_000);
  },
  unmounted() {
    this.shortcuts?.delete(COMPONENT_NAME);
    if (this.onLivebooksCloudAppRefreshBound) {
      document.removeEventListener(
        LIVEBOOKS_CLOUD_SESSION_APP_REFRESH_EVENT,
        this.onLivebooksCloudAppRefreshBound
      );
    }
    if (this.onDocumentVisibilityBound) {
      document.removeEventListener(
        'visibilitychange',
        this.onDocumentVisibilityBound
      );
    }
    if (this.onRegionalLabelsChangedBound) {
      document.removeEventListener(
        REGIONAL_LABELS_CHANGED_EVENT,
        this.onRegionalLabelsChangedBound
      );
      document.removeEventListener(
        MEMORIZED_REPORTS_CHANGED_EVENT,
        this.onRegionalLabelsChangedBound
      );
      document.removeEventListener(
        SOURCEBOOKS_CHANGED_EVENT,
        this.onRegionalLabelsChangedBound
      );
    }
    if (this.livebooksCloudReachabilityDebounce) {
      clearTimeout(this.livebooksCloudReachabilityDebounce);
      this.livebooksCloudReachabilityDebounce = null;
    }
    if (this.livebooksCloudReachabilityInterval) {
      clearInterval(this.livebooksCloudReachabilityInterval);
      this.livebooksCloudReachabilityInterval = null;
    }
    if (this.unsubscribeLivebooksSubscription) {
      this.unsubscribeLivebooksSubscription();
      this.unsubscribeLivebooksSubscription = null;
    }
  },
  methods: {
    reportIssue,
    toggleSidebar,
    openFeedbackSurvey,
    giveFeedback() {
      openFeedbackSurvey(fyo);
    },
    async setDesktopTheme(theme: DesktopTheme) {
      if (theme === this.desktopTheme) {
        return;
      }
      try {
        await persistDesktopTheme(fyo, theme);
        this.appliedDesktopTheme = theme;
        this.groups = await getSidebarConfig();
        this.setActiveGroup();
        await routeTo(theme === 'modern' ? DASHBOARD_PATH : HOME_PATH);
      } catch (error) {
        await handleErrorWithDialog(error);
      }
    },
    openDocumentation() {
      ipc.openLink('https://docs.frappe.io/' + docsPathRef.value);
    },
    applyLivebooksSubscriptionSnapshot(s: LivebooksSubscriptionSnapshot) {
      this.livebooksCloudSignedIn = s.signedIn;
      if (!s.signedIn) {
        this.livebooksCloudReachable = null;
        this.livebooksCloudSubscriptionStatus = null;
        return;
      }
      this.livebooksCloudReachable = s.reachable;
      this.livebooksCloudSubscriptionStatus = s.status;
    },
    async refreshLivebooksCloudSignedIn() {
      const { signedIn, secureStorageDegraded } =
        await getLivebooksCloudSessionSummary();
      this.livebooksCloudSignedIn = signedIn;
      this.secureStorageDegraded = !!secureStorageDegraded;
      if (!signedIn) {
        this.applyLivebooksSubscriptionSnapshot(getLivebooksSubscriptionSnapshot());
        return;
      }
      await refreshLivebooksSubscription(true);
    },
    scheduleLivebooksCloudReachabilityRefresh() {
      if (this.livebooksCloudReachabilityDebounce) {
        clearTimeout(this.livebooksCloudReachabilityDebounce);
      }
      this.livebooksCloudReachabilityDebounce = setTimeout(() => {
        this.livebooksCloudReachabilityDebounce = null;
        void this.refreshLivebooksCloudSignedIn();
      }, 400);
    },
    async handleLivebooksCloudModalPrimary() {
      if (this.livebooksCloudSignedIn) {
        await openLivebooksCloudSignIn();
      } else {
        openLivebooksCloudHome();
      }
      this.showLivebooksCloudModal = false;
    },
    async handleLivebooksCloudSignIn() {
      await openLivebooksCloudSignIn();
      this.showLivebooksCloudModal = false;
    },
    async handleDisconnectLivebooksCloud() {
      await showDialog({
        title: t`Disconnect LiveBooks Cloud?`,
        detail: t`This computer will no longer be linked to your account until you connect again. Your company file and cloud data are not deleted.`,
        type: 'warning',
        buttons: [
          {
            label: t`Cancel`,
            action: () => null,
            isEscape: true,
          },
          {
            label: t`Disconnect`,
            isPrimary: true,
            action: async () => {
              await signOutLivebooksCloud();
              this.showLivebooksCloudModal = false;
              await this.refreshLivebooksCloudSignedIn();
              showToast({
                type: 'success',
                message: t`Disconnected from LiveBooks Cloud`,
                duration: 'short',
              });
            },
          },
        ],
      });
    },
    setActiveGroup() {
      const { fullPath } = this.$router.currentRoute.value;
      const fallBackGroup = this.activeGroup;
      this.activeGroup =
        this.groups.find((g) => {
          if (fullPath.startsWith(g.route) && g.route !== '/') {
            return true;
          }

          if (g.route === fullPath) {
            return true;
          }

          if (g.items) {
            let activeItem = g.items.filter((item) =>
              this.isSidebarRouteMatch(fullPath.split('?')[0], item)
            );

            if (activeItem.length) {
              return true;
            }
          }
        }) ??
        fallBackGroup ??
        this.groups[0];
    },
    isSidebarRouteMatch(currentPath: string, item: SidebarItem) {
      const { params, query } = this.$route;
      const route = item.route.split('?')[0];
      const fromBankRegister = query.from === 'bank-register';

      // Exact path only for /list/* — `/list/Party` must not match
      // `/list/Party/Customers` (and the same for Items / Payments siblings).
      if (currentPath === route) {
        if (route.startsWith('/report/')) {
          return this.reportSidebarFiltersMatch(item);
        }
        if (route === '/bank-register/write') {
          return this.writeSidebarTypeMatch(item);
        }
        return true;
      }
      // Use Register is exact; Write Checks / Make Deposits are siblings.
      if (route === '/bank-register') {
        return false;
      }
      if (
        !route.startsWith('/list/') &&
        currentPath.startsWith(route + '/')
      ) {
        return true;
      }

      // Check Register → opened Payment: keep Banking / Check Register active
      if (
        fromBankRegister &&
        currentPath.startsWith('/edit/Payment') &&
        (route === '/bank-register' || route.startsWith('/bank-register'))
      ) {
        return true;
      }

      // Checks to Print is part of the Check Register flow
      if (
        route === '/bank-register' &&
        currentPath.startsWith('/checks-to-print')
      ) {
        return true;
      }

      // Nested bank reconcile screens live under /bank-reconcile/:name
      if (
        route === '/reconcile' &&
        currentPath.startsWith('/bank-reconcile')
      ) {
        return true;
      }

      // List views for one schema can have several filtered sidebar entries
      // (Customers vs Suppliers vs Customers & Suppliers). Path match above
      // already decided; do not activate every sibling via schemaName alone.
      if (currentPath.startsWith('/list/')) {
        return false;
      }

      if (item.schemaName && params.schemaName === item.schemaName) {
        // Payment has two sidebar entries (Receivables vs Payables). Do not
        // highlight both / the wrong one when editing a single Payment.
        if (
          item.schemaName === 'Payment' &&
          currentPath.startsWith('/edit/Payment')
        ) {
          if (fromBankRegister) {
            return false;
          }
          return this.paymentEditMatchesSidebarItem(item);
        }
        // Party has Customers / Suppliers / Common entries. Do not highlight
        // Receivables first via bare schemaName match.
        if (
          item.schemaName === 'Party' &&
          currentPath.startsWith('/edit/Party')
        ) {
          const name = params.name;
          if (typeof name !== 'string' || !name) {
            return false;
          }
          const cached = this.fyo.doc.docs.get('Party')?.[name] as
            | { role?: string }
            | undefined;
          const role = cached?.role;
          if (!role) {
            void this.resolvePartySidebarHighlight(name);
            return false;
          }
          return matchPartyEditSidebarItem(
            item,
            role,
            this.lastPartyListPath
          );
        }
        // Item has Sales / Purchase / Common entries — same shared-schema issue.
        if (
          item.schemaName === 'Item' &&
          currentPath.startsWith('/edit/Item')
        ) {
          const name = params.name;
          if (typeof name !== 'string' || !name) {
            return false;
          }
          const cached = this.fyo.doc.docs.get('Item')?.[name] as
            | { for?: string }
            | undefined;
          const forValue = cached?.for;
          if (!forValue) {
            void this.resolveItemSidebarHighlight(name);
            return false;
          }
          return matchItemEditSidebarItem(
            item,
            forValue,
            this.lastItemListPath
          );
        }
        return true;
      }

      if (
        item.schemaName === 'PrintTemplate' &&
        currentPath.startsWith('/template-builder')
      ) {
        return true;
      }

      if (
        params.name &&
        item.schemaName &&
        currentPath.includes(`${item.schemaName}/${params.name}`)
      ) {
        if (
          item.schemaName === 'Payment' &&
          currentPath.startsWith('/edit/Payment')
        ) {
          if (fromBankRegister) {
            return false;
          }
          return this.paymentEditMatchesSidebarItem(item);
        }
        if (
          item.schemaName === 'Party' &&
          currentPath.startsWith('/edit/Party')
        ) {
          const name = params.name;
          if (typeof name !== 'string' || !name) {
            return false;
          }
          const cached = this.fyo.doc.docs.get('Party')?.[name] as
            | { role?: string }
            | undefined;
          const role = cached?.role;
          if (!role) {
            void this.resolvePartySidebarHighlight(name);
            return false;
          }
          return matchPartyEditSidebarItem(
            item,
            role,
            this.lastPartyListPath
          );
        }
        if (
          item.schemaName === 'Item' &&
          currentPath.startsWith('/edit/Item')
        ) {
          const name = params.name;
          if (typeof name !== 'string' || !name) {
            return false;
          }
          const cached = this.fyo.doc.docs.get('Item')?.[name] as
            | { for?: string }
            | undefined;
          const forValue = cached?.for;
          if (!forValue) {
            void this.resolveItemSidebarHighlight(name);
            return false;
          }
          return matchItemEditSidebarItem(
            item,
            forValue,
            this.lastItemListPath
          );
        }
        return true;
      }

      return false;
    },
    paymentEditMatchesSidebarItem(item: SidebarItem): boolean {
      const name = this.$route.params.name;
      if (typeof name !== 'string' || !name) {
        return false;
      }
      const wantPay = item.filters?.paymentType === 'Pay';
      const wantReceive = item.filters?.paymentType === 'Receive';
      if (!wantPay && !wantReceive) {
        return false;
      }
      const cached = this.fyo.doc.docs.get('Payment')?.[name] as
        | { paymentType?: string }
        | undefined;
      const paymentType = cached?.paymentType;
      if (paymentType === 'Pay') {
        return wantPay;
      }
      if (paymentType === 'Receive') {
        return wantReceive;
      }
      // Doc not in cache yet — do not guess Payables; load then refresh.
      void this.resolvePaymentSidebarHighlight(name);
      return false;
    },
    async resolvePaymentSidebarHighlight(name: string) {
      if (this.resolvingPaymentHighlight === name) {
        return;
      }
      this.resolvingPaymentHighlight = name;
      try {
        await this.fyo.doc.getDoc('Payment', name);
        if (this.$route.params.name === name) {
          this.setActiveGroup();
        }
      } catch {
        /* leave unhighlighted */
      } finally {
        if (this.resolvingPaymentHighlight === name) {
          this.resolvingPaymentHighlight = '';
        }
      }
    },
    async resolvePartySidebarHighlight(name: string) {
      if (this.resolvingPartyHighlight === name) {
        return;
      }
      this.resolvingPartyHighlight = name;
      try {
        await this.fyo.doc.getDoc('Party', name);
        if (this.$route.params.name === name) {
          this.setActiveGroup();
        }
      } catch {
        /* leave unhighlighted */
      } finally {
        if (this.resolvingPartyHighlight === name) {
          this.resolvingPartyHighlight = '';
        }
      }
    },
    async resolveItemSidebarHighlight(name: string) {
      if (this.resolvingItemHighlight === name) {
        return;
      }
      this.resolvingItemHighlight = name;
      try {
        await this.fyo.doc.getDoc('Item', name);
        if (this.$route.params.name === name) {
          this.setActiveGroup();
        }
      } catch {
        /* leave unhighlighted */
      } finally {
        if (this.resolvingItemHighlight === name) {
          this.resolvingItemHighlight = '';
        }
      }
    },
    isItemActive(item: SidebarItem) {
      return this.isSidebarRouteMatch(this.$route.path, item);
    },
    writeSidebarTypeMatch(item: SidebarItem) {
      const search = item.route.includes('?')
        ? item.route.slice(item.route.indexOf('?') + 1)
        : '';
      const itemType = new URLSearchParams(search).get('type');
      const routeType =
        typeof this.$route.query.type === 'string'
          ? this.$route.query.type
          : null;
      if (itemType === 'deposit') {
        return routeType === 'deposit';
      }
      return routeType !== 'deposit';
    },
    reportSidebarFiltersMatch(item: SidebarItem) {
      const search = item.route.includes('?')
        ? item.route.slice(item.route.indexOf('?') + 1)
        : '';
      const itemParams = search ? new URLSearchParams(search) : null;
      const itemMemorized = itemParams?.get('memorizedName') ?? null;
      const routeMemorized =
        typeof this.$route.query.memorizedName === 'string'
          ? this.$route.query.memorizedName
          : null;

      if (itemMemorized || routeMemorized) {
        return itemMemorized === routeMemorized;
      }

      const itemFilters = itemParams?.get('defaultFilters') ?? null;
      const routeFilters =
        typeof this.$route.query.defaultFilters === 'string'
          ? this.$route.query.defaultFilters
          : null;

      if (itemFilters) {
        return itemFilters === routeFilters;
      }

      return !routeFilters;
    },
    isGroupActive(group: SidebarRoot) {
      return this.activeGroup && group.label === this.activeGroup.label;
    },
    routeToSidebarItem(item: SidebarItem | SidebarRoot) {
      void routeToMain(this.getPath(item));
    },
    onSidebarContextMenu(
      event: MouseEvent,
      item: SidebarItem | SidebarRoot
    ) {
      const path = this.getPath(item);
      if (!path) {
        return;
      }
      showContextMenu(event, [
        {
          label: this.t`Open in side pane`,
          action: () => openRouteInSidePane(path),
        },
      ]);
    },
    getPath(item: SidebarItem | SidebarRoot) {
      const { route: path, filters } = item;
      if (!filters) {
        return path;
      }

      return { path, query: { filters: JSON.stringify(filters) } };
    },
  },
});
</script>

<style scoped>
/* Sidebar text bumped 5% over Tailwind defaults */
.sidebar-root .text-lg {
  font-size: 1.18125rem; /* 1.125rem * 1.05 */
}

.sidebar-root .text-base {
  font-size: 1.05rem; /* 1rem * 1.05 */
}

.sidebar-root .text-sm {
  font-size: 0.91875rem; /* 0.875rem * 1.05 */
}

.sidebar-nav-scroll {
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}

.sidebar-root:hover .sidebar-nav-scroll {
  scrollbar-color: rgba(255, 255, 255, 0.35) transparent;
}

.sidebar-nav-scroll::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}

.sidebar-nav-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.sidebar-nav-scroll::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 0;
}

.sidebar-root:hover .sidebar-nav-scroll::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.35);
}

.sidebar-root:hover .sidebar-nav-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.5);
}
</style>
