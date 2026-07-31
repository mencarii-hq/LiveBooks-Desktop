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

const SIDEBAR_WIDTH_STORAGE_KEY = 'livebooks-sidebar-width-px';
const SIDEBAR_WIDTH_STORAGE_KEY_LEGACY = 'livebooks-sidebar-width-pct';
const SIDEBAR_MIN_PX = 180;
const SIDEBAR_MAX_PX = 408; // ~15% under previous 480px cap
const SIDEBAR_DEFAULT_PX = 220;

const deskRootRef = ref<HTMLElement | null>(null);

function deskWidthPx(): number {
  return deskRootRef.value?.getBoundingClientRect().width ?? 0;
}

/** Keep a fixed pixel width; only shrink if the window is too narrow to fit. */
function clampSidebarPx(n: number, totalWidth = deskWidthPx()): number {
  let px = Math.min(SIDEBAR_MAX_PX, Math.max(SIDEBAR_MIN_PX, n));
  if (totalWidth > 0) {
    // Leave room for the main pane (~40% of desk, at least 320px when possible).
    const maxForWindow = Math.max(
      SIDEBAR_MIN_PX,
      Math.min(SIDEBAR_MAX_PX, totalWidth * 0.45)
    );
    px = Math.min(maxForWindow, Math.max(SIDEBAR_MIN_PX, px));
  }
  return Math.round(px);
}

function loadSidebarWidthPx(): number {
  try {
    const raw = localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    if (raw != null) {
      const n = Number(raw);
      if (Number.isFinite(n)) return clampSidebarPx(n, 0);
    }
    // Migrate old %-based preference once desk width is known later; default for now.
    const legacy = localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY_LEGACY);
    if (legacy != null) {
      const pct = Number(legacy);
      if (Number.isFinite(pct) && pct > 0) {
        // Approximate with default desk; refined on first sync.
        return clampSidebarPx((pct / 100) * 1200, 0);
      }
    }
  } catch {
    /* ignore */
  }
  return SIDEBAR_DEFAULT_PX;
}

function persistSidebarWidthPx() {
  try {
    localStorage.setItem(
      SIDEBAR_WIDTH_STORAGE_KEY,
      String(sidebarWidthPx.value)
    );
    localStorage.removeItem(SIDEBAR_WIDTH_STORAGE_KEY_LEGACY);
  } catch {
    /* ignore */
  }
}

const sidebarWidthPx = ref(loadSidebarWidthPx());
/** Displayed width (may be temporarily smaller than preference on a narrow window). */
const liveSidebarWidthPx = ref(sidebarWidthPx.value);

function syncSidebarCssVar() {
  const el = deskRootRef.value;
  if (!el) return;
  const total = el.getBoundingClientRect().width;
  if (!showSidebar.value || total <= 0) {
    liveSidebarWidthPx.value = 0;
    document.documentElement.style.setProperty('--w-sidebar', '0px');
    return;
  }
  // Keep saved preference; only clamp visually if the window is too narrow.
  liveSidebarWidthPx.value = clampSidebarPx(sidebarWidthPx.value, total);
  document.documentElement.style.setProperty(
    '--w-sidebar',
    `${liveSidebarWidthPx.value}px`
  );
}

function pxFromClientX(clientX: number): number {
  const el = deskRootRef.value;
  if (!el) return sidebarWidthPx.value;
  const rect = el.getBoundingClientRect();
  const rtl = document.documentElement.dir === 'rtl';
  const raw = rtl ? rect.right - clientX : clientX - rect.left;
  return clampSidebarPx(raw, rect.width);
}

const isResizing = ref(false);

/** Applied while dragging so nested links/text don’t override the resize cursor. */
const RESIZING_HTML_CLASS = 'desk-sidebar-resizing';
/** Ignore tiny jitter so a click on the grip doesn’t nudge width. */
const DRAG_THRESHOLD_PX = 4;

function onResizePointerDown(e: PointerEvent) {
  if (e.button !== 0) return;
  const grip = e.currentTarget as HTMLElement;
  const pointerId = e.pointerId;
  const startX = e.clientX;
  let dragActive = false;

  grip.setPointerCapture(pointerId);

  const beginDrag = (clientX: number) => {
    if (dragActive) return;
    dragActive = true;
    isResizing.value = true;
    document.documentElement.classList.add(RESIZING_HTML_CLASS);
    document.body.style.userSelect = 'none';
    sidebarWidthPx.value = pxFromClientX(clientX);
    syncSidebarCssVar();
  };

  const onMove = (ev: PointerEvent) => {
    if (Math.abs(ev.clientX - startX) < DRAG_THRESHOLD_PX && !dragActive) {
      return;
    }
    beginDrag(ev.clientX);
    sidebarWidthPx.value = pxFromClientX(ev.clientX);
    syncSidebarCssVar();
  };

  const onEnd = (ev: PointerEvent) => {
    grip.removeEventListener('pointermove', onMove);
    grip.removeEventListener('pointerup', onEnd);
    grip.removeEventListener('pointercancel', onEnd);
    try {
      grip.releasePointerCapture(ev.pointerId);
    } catch {
      /* already released */
    }
    if (!dragActive) return;
    isResizing.value = false;
    document.documentElement.classList.remove(RESIZING_HTML_CLASS);
    document.body.style.userSelect = '';
    persistSidebarWidthPx();
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

watch([showSidebar, sidebarWidthPx], () => {
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
          min-h-0 min-w-0
          overflow-hidden
        "
        :style="{
          width: liveSidebarWidthPx + 'px',
          maxWidth: SIDEBAR_MAX_PX + 'px',
        }"
      >
        <Sidebar
          class="
            flex-1
            min-w-0 min-h-0
            h-full
            overflow-hidden
            whitespace-nowrap
          "
          :dark-mode="darkMode"
          @change-db-file="emit('change-db-file')"
        />
        <div
          class="
            sidebar-resize-grip
            window-no-drag
            shrink-0
            self-stretch
            touch-none
            z-10
          "
          :class="{ 'is-resizing': isResizing }"
          role="separator"
          aria-orientation="vertical"
          :aria-valuenow="liveSidebarWidthPx"
          :aria-valuemin="SIDEBAR_MIN_PX"
          :aria-valuemax="SIDEBAR_MAX_PX"
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
        dark:text-gray-300
        hover:bg-gray-100
        dark:hover:bg-gray-700
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

.sidebar-resize-grip {
  position: relative;
  width: 2px;
  flex-shrink: 0;
  background-color: #e8e8e6 !important;
  transition: width 120ms ease;
  cursor: col-resize;
}

.sidebar-resize-grip::before {
  content: '';
  position: absolute;
  inset-block: 0;
  inset-inline: -3px;
  width: 8px;
  cursor: col-resize;
}

.sidebar-resize-grip:hover,
.sidebar-resize-grip.is-resizing {
  width: 4px;
  background-color: #e8e8e6 !important;
  cursor: col-resize;
}
</style>

<style>
html.desk-sidebar-resizing,
html.desk-sidebar-resizing * {
  cursor: col-resize !important;
}
</style>
