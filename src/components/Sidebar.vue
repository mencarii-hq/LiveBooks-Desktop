<template>
  <div
    class="sidebar-root py-2 h-full min-h-0 flex flex-col bg-green-700 relative"
    :class="{
      'window-drag': platform !== 'Windows',
    }"
  >
    <!-- Nav must be no-drag + overflow so wheel/trackpad scroll works under app-region:drag -->
    <div
      class="flex-1 min-h-0 overflow-y-auto window-no-drag sidebar-nav-scroll"
    >
      <!-- Brand + company -->
      <div
        class=""
        :class="
          platform === 'Mac' && languageDirection === 'ltr' ? 'mt-5' : 'mt-3'
        "
      >
        <div
          data-testid="switch-company"
          class="
            text-lg
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
        >
          <Icon
            class="flex-shrink-0"
            :name="group.icon"
            :size="group.iconSize || '18'"
            :height="group.iconHeight ?? 3"
            :active="!!isGroupActive(group)"
            :darkMode="darkMode"
            :onPrimary="true"
            :class="isGroupActive(group) && !group.items ? '-ms-1' : ''"
          />
          <div
            class="ms-2 text-lg"
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
            :key="item.label"
            class="
              text-base
              h-8
              ps-10
              cursor-pointer
              flex
              items-center
              hover:bg-green-800
            "
            :class="
              isItemActive(item)
                ? 'bg-green-700 text-white border-s-4 border-white'
                : 'text-white'
            "
            @click="routeToSidebarItem(item)"
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
          {{ t`Manage Cloud` }}
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
            text-white text-lg
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
              t`Sign in on the web to link this computer to LiveBooks Cloud. Keep this app open while you connect.`
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
                : t`Sign in on the web`
            }}
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
import { reportIssue } from 'src/errorHandling';
import { fyo } from 'src/initFyo';
import { showDialog, showToast } from 'src/utils/interactive';
import {
  getLivebooksCloudSessionSummary,
  LIVEBOOKS_CLOUD_SESSION_APP_REFRESH_EVENT,
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
import { routeTo, toggleSidebar } from 'src/utils/ui';
import { openFeedbackSurvey } from 'src/utils/feedbackSurvey';
import { livebooksDesktopDisplayName } from 'utils/livebooksAppEnv';
import { REGIONAL_LABELS_CHANGED_EVENT } from 'utils/regional';
import { defineComponent, inject } from 'vue';
import router from '../router';
import Button from './Button.vue';
import Icon from './Icon.vue';
import Modal from './Modal.vue';
import ShortcutsHelper from './ShortcutsHelper.vue';

const COMPONENT_NAME = 'Sidebar';

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
    livebooksCloudManageButtonTitle(): string {
      if (!this.livebooksCloudSignedIn) {
        return t`LiveBooks Cloud — sign in or manage`;
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
    router.afterEach(() => {
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
    routeTo,
    reportIssue,
    toggleSidebar,
    openFeedbackSurvey,
    giveFeedback() {
      openFeedbackSurvey(fyo);
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
      const route = item.route;
      const fromBankRegister = query.from === 'bank-register';

      if (currentPath === route || currentPath.startsWith(route + '/')) {
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
    isItemActive(item: SidebarItem) {
      return this.isSidebarRouteMatch(this.$route.path, item);
    },
    isGroupActive(group: SidebarRoot) {
      return this.activeGroup && group.label === this.activeGroup.label;
    },
    routeToSidebarItem(item: SidebarItem | SidebarRoot) {
      routeTo(this.getPath(item));
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
