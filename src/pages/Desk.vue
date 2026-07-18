<script setup lang="ts">
import { showSidebar } from 'src/utils/refs';
import { toggleSidebar } from 'src/utils/ui';
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { runApplyJournalRecovery } from 'src/utils/plaidApplyRecovery';
import {
  notifyPlaidBackgroundMfaVerified,
  startPlaidBackgroundSync,
  stopPlaidBackgroundSync,
} from 'src/utils/plaidBackgroundSync';
import PlaidBankSyncMfaBanner from 'src/components/PlaidBankSyncMfaBanner.vue';
import PlaidSyncStatusBanner from 'src/components/PlaidSyncStatusBanner.vue';
import Sidebar from '../components/Sidebar.vue';

const emit = defineEmits(['change-db-file']);

defineProps({
  darkMode: { type: Boolean, default: false },
});

const SIDEBAR_WIDTH_STORAGE_KEY = 'livebooks-sidebar-width-pct';
const SIDEBAR_MIN_PCT = 10;
const SIDEBAR_MAX_PCT = 20;
const SIDEBAR_DEFAULT_PCT = 15;

function loadSidebarWidthPct(): number {
  try {
    const raw = localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    if (raw == null) return SIDEBAR_DEFAULT_PCT;
    const n = Number(raw);
    if (!Number.isFinite(n)) return SIDEBAR_DEFAULT_PCT;
    return Math.min(SIDEBAR_MAX_PCT, Math.max(SIDEBAR_MIN_PCT, n));
  } catch {
    return SIDEBAR_DEFAULT_PCT;
  }
}

const deskRootRef = ref<HTMLElement | null>(null);
const sidebarWidthPct = ref(loadSidebarWidthPct());

function clampSidebarPct(n: number): number {
  return Math.min(SIDEBAR_MAX_PCT, Math.max(SIDEBAR_MIN_PCT, n));
}

function syncSidebarCssVar() {
  const el = deskRootRef.value;
  if (!el) return;
  const total = el.getBoundingClientRect().width;
  if (!showSidebar.value || total <= 0) {
    document.documentElement.style.setProperty('--w-sidebar', '0px');
    return;
  }
  const px = (total * sidebarWidthPct.value) / 100;
  document.documentElement.style.setProperty('--w-sidebar', `${px}px`);
}

function percentFromClientX(clientX: number): number {
  const el = deskRootRef.value;
  if (!el) return sidebarWidthPct.value;
  const rect = el.getBoundingClientRect();
  const rtl = document.documentElement.dir === 'rtl';
  const raw = rtl
    ? ((rect.right - clientX) / rect.width) * 100
    : ((clientX - rect.left) / rect.width) * 100;
  return clampSidebarPct(raw);
}

let resizeActive = false;

/** Applied while dragging so nested links/text don’t override the resize cursor. */
const RESIZING_HTML_CLASS = 'desk-sidebar-resizing';

function onResizePointerDown(e: PointerEvent) {
  if (e.button !== 0) return;
  e.preventDefault();
  const grip = e.currentTarget as HTMLElement;
  grip.setPointerCapture(e.pointerId);

  resizeActive = true;
  document.documentElement.classList.add(RESIZING_HTML_CLASS);
  document.body.style.userSelect = 'none';

  sidebarWidthPct.value = percentFromClientX(e.clientX);
  syncSidebarCssVar();

  const onMove = (ev: PointerEvent) => {
    if (!resizeActive) return;
    sidebarWidthPct.value = percentFromClientX(ev.clientX);
    syncSidebarCssVar();
  };

  const onEnd = (ev: PointerEvent) => {
    if (!resizeActive) return;
    resizeActive = false;
    document.documentElement.classList.remove(RESIZING_HTML_CLASS);
    document.body.style.userSelect = '';
    grip.removeEventListener('pointermove', onMove);
    grip.removeEventListener('pointerup', onEnd);
    grip.removeEventListener('pointercancel', onEnd);
    try {
      grip.releasePointerCapture(ev.pointerId);
    } catch {
      /* already released */
    }
    try {
      localStorage.setItem(
        SIDEBAR_WIDTH_STORAGE_KEY,
        String(sidebarWidthPct.value)
      );
    } catch {
      /* ignore */
    }
  };

  grip.addEventListener('pointermove', onMove);
  grip.addEventListener('pointerup', onEnd);
  grip.addEventListener('pointercancel', onEnd);
}

function onWindowResize() {
  syncSidebarCssVar();
}

let applyRecoveryTimer: ReturnType<typeof setTimeout> | null = null;

function onPlaidMfaVerified() {
  notifyPlaidBackgroundMfaVerified();
}

onMounted(() => {
  void nextTick(() => syncSidebarCssVar());
  window.addEventListener('resize', onWindowResize);

  applyRecoveryTimer = setTimeout(() => {
    void runApplyJournalRecovery();
  }, 2000);

  startPlaidBackgroundSync();
});

onUnmounted(() => {
  window.removeEventListener('resize', onWindowResize);
  document.documentElement.classList.remove(RESIZING_HTML_CLASS);
  document.body.style.userSelect = '';
  if (applyRecoveryTimer) {
    clearTimeout(applyRecoveryTimer);
    applyRecoveryTimer = null;
  }
  stopPlaidBackgroundSync();
});

watch([showSidebar, sidebarWidthPct], () => {
  void nextTick(() => syncSidebarCssVar());
});
</script>
<template>
  <div
    ref="deskRootRef"
    class="flex overflow-hidden flex-1 min-h-0 min-w-0 relative"
  >
    <Transition name="sidebar">
      <div
        v-show="showSidebar"
        class="
          sidebar-shell
          flex flex-shrink-0
          h-full
          min-h-0
          border-e border-green-800
          overflow-hidden
        "
        :style="{ width: sidebarWidthPct + '%' }"
      >
        <Sidebar
          class="flex-1 min-w-0 h-full whitespace-nowrap"
          :dark-mode="darkMode"
          @change-db-file="emit('change-db-file')"
        />
        <div
          class="
            window-no-drag
            w-1
            shrink-0
            self-stretch
            bg-gray-400
            dark:bg-gray-600
            hover:bg-gray-500
            dark:hover:bg-gray-500
            cursor-default
            hover:cursor-ew-resize
            touch-none
            z-10
          "
          role="separator"
          aria-orientation="vertical"
          :aria-valuenow="sidebarWidthPct"
          :aria-valuemin="SIDEBAR_MIN_PCT"
          :aria-valuemax="SIDEBAR_MAX_PCT"
          @pointerdown="onResizePointerDown"
        />
      </div>
    </Transition>

    <div
      class="
        flex flex-1 flex-col
        overflow-y-hidden
        custom-scroll custom-scroll-thumb1
        bg-white
        dark:bg-gray-875
      "
    >
      <div class="shrink-0 px-4 pt-2">
        <PlaidBankSyncMfaBanner @verified="onPlaidMfaVerified" />
        <PlaidSyncStatusBanner />
      </div>
      <div class="flex flex-1 min-h-0 overflow-hidden">
        <router-view v-slot="{ Component }">
          <keep-alive>
            <component
              :is="Component"
              :key="$route.path"
              :dark-mode="darkMode"
              class="flex-1 min-h-0 min-w-0"
            />
          </keep-alive>
        </router-view>

        <router-view v-slot="{ Component, route }" name="edit">
          <Transition name="quickedit">
            <div v-if="route?.query?.edit" class="h-full shrink-0">
              <component
                :is="Component"
                :key="route.query.schemaName + route.query.name"
                :dark-mode="darkMode"
              />
            </div>
          </Transition>
        </router-view>
      </div>
    </div>

    <button
      v-show="!showSidebar"
      class="
        absolute
        bottom-0
        start-0
        text-gray-600
        dark:text-gray-400
        hover:bg-gray-100
        dark:hover:bg-gray-900
        rounded
        rtl-rotate-180
        p-1
        m-4
        opacity-0
        hover:opacity-100 hover:shadow-md
      "
      @click="() => toggleSidebar()"
    >
      <feather-icon name="chevrons-right" class="w-4 h-4" />
    </button>
  </div>
</template>

<style scoped>
.sidebar-enter-from,
.sidebar-leave-to {
  opacity: 0;
  width: 0 !important;
  overflow: hidden;
}

.sidebar-enter-to,
.sidebar-leave-from {
  opacity: 1;
}

.sidebar-enter-active,
.sidebar-leave-active {
  transition: opacity 150ms ease-out, width 150ms ease-out;
}
</style>

<style>
html.desk-sidebar-resizing,
html.desk-sidebar-resizing * {
  cursor: ew-resize !important;
}
</style>
