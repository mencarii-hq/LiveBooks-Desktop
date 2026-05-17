<template>
  <div
    class="py-2 h-full flex justify-between flex-col bg-green-700 relative"
    :class="{
      'window-drag': platform !== 'Windows',
    }"
  >
    <div>
      <!-- Brand + company -->
      <div
        class=""
        :class="
          platform === 'Mac' && languageDirection === 'ltr' ? 'mt-8' : 'mt-3'
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
        <hr class="dark:border-gray-800 mx-4" />
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
            :height="group.iconHeight ?? 0"
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
              h-10
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
    <div class="window-no-drag flex flex-col gap-2 py-2 px-4">
      <hr class="dark:border-gray-800" />
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
        @click="openDocumentation"
      >
        <feather-icon name="help-circle" class="h-4 w-4 flex-shrink-0" />
        <p>
          {{ t`Help` }}
        </p>
      </button> -->

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
          class="h-4 w-4 flex-shrink-0"
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

      <hr class="dark:border-gray-800" />
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
        <p
          v-if="livebooksCloudSignedIn && livebooksCloudReachable === false"
          class="
            text-white/85 text-xs
            mt-1
            leading-snug
            whitespace-normal
            break-words
          "
        >
          {{ t`Cannot reach LiveBooks Cloud` }}
        </p>
        <p
          v-else-if="livebooksCloudPaymentFailed"
          class="
            text-amber-200 text-xs
            mt-1
            leading-snug
            whitespace-normal
            break-words
          "
        >
          {{ t`Payment failed.` }}
          <button
            type="button"
            class="underline hover:text-white"
            @click="handleManageBilling"
          >
            {{ t`Update billing info` }}
          </button>
          {{ t`to avoid losing access.` }}
        </p>
        <p
          v-else-if="livebooksCloudSubscriptionExpired"
          class="
            text-amber-200 text-xs
            mt-1
            leading-snug
            whitespace-normal
            break-words
          "
        >
          {{ t`Subscription expired` }}
          <button
            type="button"
            class="underline hover:text-white"
            @click="handleManageBilling"
          >
            {{ t`Manage billing` }}
          </button>
        </p>
        <p
          v-else-if="livebooksCloudNeedsSubscription"
          class="
            text-white/85 text-xs
            mt-1
            leading-snug
            whitespace-normal
            break-words
          "
        >
          {{ t`Subscribe to enable bank sync` }}
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
                dark:text-gray-400
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
              dark:text-gray-400
              whitespace-normal
              break-words
            "
          >
            {{
              t`This computer is linked to your account. Open the website to manage billing and subscription, or disconnect this app below.`
            }}
          </p>
          <p
            v-else
            class="
              text-sm text-gray-600
              dark:text-gray-400
              whitespace-normal
              break-words
            "
          >
            {{
              t`Sign in on the web to link this computer to LiveBooks Cloud. Keep this app open while you connect.`
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
  openLivebooksCloudBillingPortal,
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
import { livebooksDesktopDisplayName } from 'utils/livebooksAppEnv';
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
      livebooksCloudInGracePeriod: false,
      showLivebooksCloudModal: false,
      livebooksCloudReachabilityDebounce: null as ReturnType<
        typeof setTimeout
      > | null,
      livebooksCloudReachabilityInterval: null as ReturnType<
        typeof setInterval
      > | null,
      onLivebooksCloudAppRefreshBound: null as (() => void) | null,
      onDocumentVisibilityBound: null as (() => void) | null,
      unsubscribeLivebooksSubscription: null as (() => void) | null,
    } as {
      companyName: string;
      groups: SidebarConfig;
      viewShortcuts: boolean;
      activeGroup: null | SidebarRoot;
      livebooksCloudSignedIn: boolean;
      livebooksCloudReachable: boolean | null;
      livebooksCloudSubscriptionStatus: string | null;
      livebooksCloudInGracePeriod: boolean;
      showLivebooksCloudModal: boolean;
      livebooksCloudReachabilityDebounce: ReturnType<typeof setTimeout> | null;
      livebooksCloudReachabilityInterval: ReturnType<
        typeof setInterval
      > | null;
      onLivebooksCloudAppRefreshBound: (() => void) | null;
      onDocumentVisibilityBound: (() => void) | null;
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
    livebooksCloudPaymentFailed(): boolean {
      if (!this.livebooksCloudSignedIn || this.livebooksCloudReachable !== true) {
        return false;
      }
      const status = this.livebooksCloudSubscriptionStatus;
      return status === 'past_due' && this.livebooksCloudInGracePeriod;
    },
    livebooksCloudSubscriptionExpired(): boolean {
      if (!this.livebooksCloudSignedIn || this.livebooksCloudReachable !== true) {
        return false;
      }
      const status = this.livebooksCloudSubscriptionStatus;
      if (status === 'past_due' && this.livebooksCloudInGracePeriod) {
        return false;
      }
      return status === 'past_due' || status === 'canceled' || status === 'incomplete_expired';
    },
    livebooksCloudNeedsSubscription(): boolean {
      if (!this.livebooksCloudSignedIn || this.livebooksCloudReachable !== true) {
        return false;
      }
      const status = this.livebooksCloudSubscriptionStatus;
      return status === 'none' || status === null;
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
    openDocumentation() {
      ipc.openLink('https://docs.frappe.io/' + docsPathRef.value);
    },
    applyLivebooksSubscriptionSnapshot(s: LivebooksSubscriptionSnapshot) {
      this.livebooksCloudSignedIn = s.signedIn;
      if (!s.signedIn) {
        this.livebooksCloudReachable = null;
        this.livebooksCloudSubscriptionStatus = null;
        this.livebooksCloudInGracePeriod = false;
        return;
      }
      this.livebooksCloudReachable = s.reachable;
      this.livebooksCloudSubscriptionStatus = s.status;
      this.livebooksCloudInGracePeriod = s.inGracePeriod;
    },
    async refreshLivebooksCloudSignedIn() {
      const { signedIn } = await getLivebooksCloudSessionSummary();
      this.livebooksCloudSignedIn = signedIn;
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
    async handleManageBilling() {
      const res = await openLivebooksCloudBillingPortal();
      if (!res.ok) {
        showToast({
          type: 'error',
          message: t`Could not open billing portal. Please try again.`,
          duration: 'short',
        });
      }
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
            let activeItem = g.items.filter(
              ({ route }) => route === fullPath || fullPath.startsWith(route)
            );

            if (activeItem.length) {
              return true;
            }
          }
        }) ??
        fallBackGroup ??
        this.groups[0];
    },
    isItemActive(item: SidebarItem) {
      const { path: currentRoute, params } = this.$route;
      const routeMatch = currentRoute === item.route;

      const schemaNameMatch =
        item.schemaName && params.schemaName === item.schemaName;

      const isMatch = routeMatch || schemaNameMatch;
      if (params.name && item.schemaName && !isMatch) {
        return currentRoute.includes(`${item.schemaName}/${params.name}`);
      }

      return isMatch;
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
