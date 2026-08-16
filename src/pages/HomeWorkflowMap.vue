<template>
  <div class="flex flex-col overflow-y-hidden h-full">
    <PageHeader :title="t`Home`" />

    <div class="home-map-wrap flex-1 min-h-0 dark:bg-gray-875">
      <VueFlow
        v-if="ready"
        id="home-map"
        class="home-map-flow"
        :nodes="flowNodes"
        :edges="flowEdges"
        :nodes-draggable="false"
        :nodes-connectable="false"
        :nodes-focusable="false"
        :edges-focusable="false"
        :elements-selectable="false"
        :zoom-on-double-click="false"
        :zoom-on-scroll="false"
        :pan-on-scroll="true"
        :pan-on-drag="true"
        :min-zoom="MIN_ZOOM"
        :max-zoom="MAX_ZOOM"
        :fit-view-on-init="false"
        :translate-extent="translateExtent"
        @nodes-initialized="applyFrame"
        @move-end="persistViewport"
        @node-click="onFlowNodeClick"
      >
        <template #node-lane="{ data }">
          <div
            class="
              home-map-lane
              nopan
              border border-gray-300
              dark:border-gray-700
              rounded-xl
              bg-white
              dark:bg-gray-900
            "
          >
            <span
              class="
                home-map-lane-pill
                text-gray-600
                dark:text-gray-300
                bg-gray-100
                dark:bg-gray-800
                border border-gray-200
                dark:border-gray-600
              "
            >
              {{ data.title }}
            </span>
          </div>
        </template>

        <template #node-task="{ data }">
          <button
            type="button"
            class="home-map-node nodrag nopan"
            :class="{ 'home-map-node--live': isLive(data.node) }"
            :title="data.node.label"
            @click.stop="openNode(data.node)"
          >
            <Handle
              class="home-map-handle"
              type="target"
              :position="Position.Left"
            />
            <FeatherIcon class="home-map-node-icon" :name="data.node.icon" />
            <span class="home-map-node-label">{{ data.node.label }}</span>
            <Handle
              class="home-map-handle"
              type="source"
              :position="Position.Right"
            />
          </button>
        </template>
      </VueFlow>

      <div v-if="ready" class="home-map-controls">
        <div
          class="home-map-controls-pan"
          role="group"
          :aria-label="t`Move map`"
        >
          <button
            type="button"
            class="home-map-ctrl home-map-ctrl--up"
            :title="t`Move up`"
            @click="nudge(0, -PAN_STEP)"
          >
            <FeatherIcon name="chevron-up" class="w-3 h-3" />
          </button>
          <button
            type="button"
            class="home-map-ctrl home-map-ctrl--left"
            :title="t`Move left`"
            @click="nudge(-PAN_STEP, 0)"
          >
            <FeatherIcon name="chevron-left" class="w-3 h-3" />
          </button>
          <button
            type="button"
            class="home-map-ctrl home-map-ctrl--center"
            :title="t`Center map`"
            @click="centerMap"
          >
            <span class="home-map-ctrl-dot" />
          </button>
          <button
            type="button"
            class="home-map-ctrl home-map-ctrl--right"
            :title="t`Move right`"
            @click="nudge(PAN_STEP, 0)"
          >
            <FeatherIcon name="chevron-right" class="w-3 h-3" />
          </button>
          <button
            type="button"
            class="home-map-ctrl home-map-ctrl--down"
            :title="t`Move down`"
            @click="nudge(0, PAN_STEP)"
          >
            <FeatherIcon name="chevron-down" class="w-3 h-3" />
          </button>
        </div>

        <div class="home-map-controls-zoom" role="group" :aria-label="t`Zoom`">
          <button
            type="button"
            class="home-map-ctrl"
            :title="t`Zoom in`"
            :disabled="zoomPercent >= 150"
            @click="stepZoom(0.05)"
          >
            <FeatherIcon name="plus" class="w-4 h-4" />
          </button>
          <div class="home-map-zoom-bar-wrap">
            <input
              class="home-map-zoom-bar"
              type="range"
              min="50"
              max="150"
              step="5"
              :value="zoomPercent"
              :aria-label="t`Zoom`"
              @input="onZoomBar"
            />
          </div>
          <button
            type="button"
            class="home-map-ctrl"
            :title="t`Zoom out`"
            :disabled="zoomPercent <= 50"
            @click="stepZoom(-0.05)"
          >
            <FeatherIcon name="minus" class="w-4 h-4" />
          </button>
          <span class="home-map-zoom-label">{{ zoomPercent }}%</span>
          <button
            type="button"
            class="home-map-ctrl"
            :title="t`Full size`"
            @click="fitFullSize"
          >
            <FeatherIcon name="maximize" class="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import {
  Handle,
  MarkerType,
  Position,
  VueFlow,
  useVueFlow,
} from '@vue-flow/core';
import type { Edge, Node } from '@vue-flow/core';
import FeatherIcon from 'src/components/FeatherIcon.vue';
import PageHeader from 'src/components/PageHeader.vue';
import { fyo } from 'src/initFyo';
import { layoutHomeMap, type HomeMapLayout } from 'src/utils/homeMapLayout';
import {
  getHomeMap,
  isHomeMapNodeLive,
  logHomeMapNodeClick,
  type HomeMapNode,
} from 'src/utils/qbdFamiliarity';
import { routeTo } from 'src/utils/ui';
import { defineComponent } from 'vue';
import '@vue-flow/core/dist/style.css';

/** Single neutral tone that reads on both light and dark backgrounds. */
const EDGE_COLOR = '#8b929e';

/** Slack around the laid-out map; keeps grab-pan from wandering infinitely. */
const PAN_PAD = 560;
const PAN_STEP = 96;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 1.5;
const FRAME_PAD_Y = 12;
const VIEWPORT_KEY = 'homeMapViewport';
const UNBOUNDED_EXTENT: [[number, number], [number, number]] = [
  [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
  [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
];

export default defineComponent({
  name: 'HomeWorkflowMap',
  components: { PageHeader, FeatherIcon, VueFlow, Handle },
  setup() {
    const { setViewport, getViewport, viewport } = useVueFlow('home-map');
    return {
      setViewport,
      getViewport,
      viewport,
      Position,
      PAN_STEP,
      MIN_ZOOM,
      MAX_ZOOM,
    };
  },
  data() {
    return {
      ready: false,
      flowNodes: [] as Node[],
      flowEdges: [] as Edge[],
      translateExtent: UNBOUNDED_EXTENT,
      baseLayout: null as HomeMapLayout | null,
    };
  },
  computed: {
    zoomPercent(): number {
      return Math.round((this.viewport?.zoom ?? 1) * 100);
    },
  },
  async mounted() {
    await this.buildElements();
    await this.$nextTick();
    this.applyFrame();
  },
  methods: {
    isLive: isHomeMapNodeLive,
    persistViewport() {
      try {
        const { x, y, zoom } = this.getViewport();
        localStorage.setItem(VIEWPORT_KEY, JSON.stringify({ x, y, zoom }));
      } catch {
        /* private mode / quota */
      }
    },
    commitViewport(next: { x: number; y: number; zoom: number }) {
      void this.setViewport(next);
      try {
        localStorage.setItem(VIEWPORT_KEY, JSON.stringify(next));
      } catch {
        /* private mode / quota */
      }
    },
    restoreViewport(): boolean {
      try {
        const raw = localStorage.getItem(VIEWPORT_KEY);
        if (!raw) {
          return false;
        }
        const saved = JSON.parse(raw) as { x?: number; y?: number; zoom?: number };
        if (
          !Number.isFinite(saved.x) ||
          !Number.isFinite(saved.y) ||
          !Number.isFinite(saved.zoom)
        ) {
          return false;
        }
        void this.setViewport({
          x: saved.x as number,
          y: saved.y as number,
          zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, saved.zoom as number)),
        });
        return true;
      } catch {
        return false;
      }
    },
    applyFrame() {
      if (this.restoreViewport()) {
        return;
      }

      const wrap = this.$el?.querySelector?.(
        '.home-map-wrap'
      ) as HTMLElement | null;
      if (!this.baseLayout || !wrap || wrap.clientWidth < 10) {
        return;
      }

      const zoom = 1;
      this.commitViewport({
        x: (wrap.clientWidth - this.baseLayout.width * zoom) / 2,
        y: FRAME_PAD_Y,
        zoom,
      });
    },
    fitFullSize() {
      const wrap = this.$el?.querySelector?.(
        '.home-map-wrap'
      ) as HTMLElement | null;
      if (!this.baseLayout || !wrap || wrap.clientWidth < 10) {
        return;
      }

      const pad = FRAME_PAD_Y * 2;
      const widthZoom = (wrap.clientWidth - pad) / this.baseLayout.width;
      const heightZoom = (wrap.clientHeight - pad) / this.baseLayout.height;
      const zoom =
        Math.round(
          Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(widthZoom, heightZoom))) *
            20
        ) / 20;
      this.commitViewport({
        x: (wrap.clientWidth - this.baseLayout.width * zoom) / 2,
        y: (wrap.clientHeight - this.baseLayout.height * zoom) / 2,
        zoom,
      });
    },
    centerMap() {
      const wrap = this.$el?.querySelector?.(
        '.home-map-wrap'
      ) as HTMLElement | null;
      if (!this.baseLayout || !wrap || wrap.clientWidth < 10) {
        return;
      }
      const zoom = this.getViewport().zoom;
      this.commitViewport({
        x: (wrap.clientWidth - this.baseLayout.width * zoom) / 2,
        y: (wrap.clientHeight - this.baseLayout.height * zoom) / 2,
        zoom,
      });
    },
    async buildElements() {
      const map = getHomeMap();
      const layout = await layoutHomeMap(map);
      this.baseLayout = layout;
      const titles = Object.fromEntries(
        map.lanes.map((lane) => [lane.id, lane.title])
      );
      const nodesById = Object.fromEntries(map.nodes.map((n) => [n.id, n]));

      const laneNodes: Node[] = layout.lanes.map((lane) => ({
        id: `lane-${lane.id}`,
        type: 'lane',
        position: { x: lane.x, y: lane.y },
        data: { title: titles[lane.id] },
        class: 'nopan',
        draggable: false,
        selectable: false,
        focusable: false,
        zIndex: 0,
        style: { width: `${lane.w}px`, height: `${lane.h}px` },
      }));

      const taskNodes: Node[] = layout.nodes.map((placed) => ({
        id: placed.id,
        type: 'task',
        parentNode: `lane-${placed.laneId}`,
        position: { x: placed.x, y: placed.y },
        data: { node: nodesById[placed.id] },
        class: 'nodrag nopan',
        draggable: false,
        selectable: false,
        focusable: false,
        zIndex: 2,
      }));

      const edges: Edge[] = [];
      for (const edge of map.edges) {
        for (const source of [edge.from, ...(edge.joinFrom ?? [])]) {
          edges.push({
            id: `${source}->${edge.to}`,
            source,
            target: edge.to,
            type: 'smoothstep',
            zIndex: 4,
            style: { stroke: EDGE_COLOR, strokeWidth: 1.5 },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: EDGE_COLOR,
              width: 16,
              height: 14,
            },
          });
        }
      }

      this.flowNodes = [...laneNodes, ...taskNodes];
      this.flowEdges = edges;
      this.translateExtent = [
        [-PAN_PAD, -PAN_PAD],
        [layout.width + PAN_PAD, layout.height + PAN_PAD],
      ];
      this.ready = true;
    },
    nudge(dx: number, dy: number) {
      const current = this.getViewport();
      this.commitViewport({
        x: current.x + dx,
        y: current.y + dy,
        zoom: current.zoom,
      });
    },
    setZoom(zoom: number) {
      const wrap = this.$el?.querySelector?.(
        '.home-map-wrap'
      ) as HTMLElement | null;
      const current = this.getViewport();
      const next =
        Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)) * 20) / 20;
      if (!wrap) {
        this.commitViewport({ ...current, zoom: next });
        return;
      }
      const cx = wrap.clientWidth / 2;
      const cy = wrap.clientHeight / 2;
      this.commitViewport({
        x: cx - ((cx - current.x) / current.zoom) * next,
        y: cy - ((cy - current.y) / current.zoom) * next,
        zoom: next,
      });
    },
    stepZoom(delta: number) {
      this.setZoom(this.getViewport().zoom + delta);
    },
    onZoomBar(event: Event) {
      const value = Number((event.target as HTMLInputElement).value);
      this.setZoom(value / 100);
    },
    onFlowNodeClick(event: { node: Node }) {
      if (event.node.type !== 'task') {
        return;
      }
      const node = event.node.data?.node as HomeMapNode | undefined;
      if (node) {
        void this.openNode(node);
      }
    },
    async openNode(node: HomeMapNode) {
      if (!isHomeMapNodeLive(node) || !node.path) {
        return;
      }
      logHomeMapNodeClick(fyo, node.id);
      const [path, queryString] = node.path.split('?');
      const query: Record<string, string> = {};
      if (queryString) {
        const params = new URLSearchParams(queryString);
        params.forEach((value, key) => {
          query[key] = value;
        });
      }
      if (node.filters) {
        query.filters = JSON.stringify(node.filters);
      }
      await routeTo(Object.keys(query).length ? { path, query } : path);
    },
  },
});
</script>

<style>
.home-map-wrap {
  position: relative;
}

.home-map-flow {
  width: 100%;
  height: 100%;
  background: transparent;
}

.home-map-flow .vue-flow__pane {
  cursor: grab;
}

.home-map-flow .vue-flow__pane:active {
  cursor: grabbing;
}

.home-map-controls {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  pointer-events: none;
}

.home-map-controls-pan,
.home-map-controls-zoom {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px;
  border-radius: 12px;
  border: 1px solid #d1d5db;
  background: rgba(255, 255, 255, 0.2);
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
}

html.dark .home-map-controls-pan,
html.dark .home-map-controls-zoom {
  border-color: #4b5563;
  background: rgba(17, 24, 39, 0.2);
}

.home-map-controls-pan {
  display: grid;
  grid-template-areas:
    '. up .'
    'left center right'
    '. down .';
  grid-template-columns: 17px 20px 17px;
  grid-template-rows: 17px 20px 17px;
  place-items: center;
  gap: 0;
  padding: 4px;
  width: auto;
}

.home-map-controls-pan .home-map-ctrl {
  width: 17px;
  height: 17px;
}

.home-map-controls-pan .home-map-ctrl--center {
  width: 20px;
  height: 20px;
}

.home-map-ctrl--up {
  grid-area: up;
  margin-bottom: -6px;
}

.home-map-ctrl--left {
  grid-area: left;
  margin-right: -6px;
}

.home-map-ctrl--center {
  grid-area: center;
}

.home-map-ctrl--right {
  grid-area: right;
  margin-left: -6px;
}

.home-map-ctrl--down {
  grid-area: down;
  margin-top: -6px;
}

.home-map-controls-zoom {
  flex-direction: column;
  height: auto;
  width: 44px;
  padding: 8px 6px;
}

.home-map-ctrl {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #374151;
  cursor: pointer;
}

.home-map-ctrl:hover:not(:disabled) {
  background: #f3f4f6;
}

.home-map-ctrl:disabled {
  opacity: 0.4;
  cursor: default;
}

.home-map-ctrl--center {
  color: #15803d;
}

.home-map-ctrl-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
}

html.dark .home-map-ctrl {
  color: #e5e7eb;
}

html.dark .home-map-ctrl:hover:not(:disabled) {
  background: #374151;
}

html.dark .home-map-ctrl--center {
  color: #4ade80;
}

.home-map-zoom-bar-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 88px;
}

.home-map-zoom-bar {
  width: 88px;
  height: 18px;
  margin: 0;
  transform: rotate(-90deg);
  accent-color: #16a34a;
  cursor: pointer;
}

.home-map-zoom-label {
  min-width: 0;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: #6b7280;
  text-align: center;
}

html.dark .home-map-zoom-label {
  color: #9ca3af;
}

.home-map-flow .vue-flow__node {
  cursor: default;
}

.home-map-flow .vue-flow__node-lane {
  pointer-events: auto;
  cursor: default;
}

.home-map-flow .vue-flow__edge,
.home-map-flow .vue-flow__edge-interaction {
  pointer-events: none;
}

/* Edges live above lane backgrounds so cross-lane arrows stay visible. */
.home-map-flow .vue-flow__edge-path {
  transition: stroke 0.15s ease;
}

.home-map-flow .vue-flow__edge:hover .vue-flow__edge-path {
  stroke: #16a34a;
  stroke-dasharray: 6 4;
  animation: home-map-dash 0.5s linear infinite;
}

@keyframes home-map-dash {
  to {
    stroke-dashoffset: -10;
  }
}

.home-map-lane {
  width: 100%;
  height: 100%;
  position: relative;
}

.home-map-lane-pill {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translate(-50%, -50%);
  display: inline-block;
  padding: 3px 14px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  line-height: 1.2;
  white-space: nowrap;
}

/* Handles only anchor edges; keep them invisible, centered on the icon. */
.home-map-flow .home-map-handle {
  width: 2px;
  height: 2px;
  min-width: 0;
  min-height: 0;
  top: 18px;
  border: none;
  background: transparent;
  pointer-events: none;
}

.home-map-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
  box-sizing: border-box;
  width: 92px;
  padding: 0;
  appearance: none;
  -webkit-appearance: none;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: inherit;
  outline: none;
  box-shadow: none;
  -webkit-tap-highlight-color: transparent;
}

.home-map-node--live {
  cursor: pointer;
}

.home-map-node--live:hover .home-map-node-label,
.home-map-node--live:focus .home-map-node-label,
.home-map-node--live:focus-visible .home-map-node-label,
.home-map-node--live:active .home-map-node-label {
  color: #15803d;
}

.home-map-node--live:focus .home-map-node-icon,
.home-map-node--live:focus-visible .home-map-node-icon {
  box-shadow: 0 0 0 2px #16a34a;
}

html.dark .home-map-node--live:hover .home-map-node-label,
html.dark .home-map-node--live:focus .home-map-node-label,
html.dark .home-map-node--live:focus-visible .home-map-node-label,
html.dark .home-map-node--live:active .home-map-node-label {
  color: #4ade80;
}

html.dark .home-map-node--live:focus .home-map-node-icon,
html.dark .home-map-node--live:focus-visible .home-map-node-icon {
  box-shadow: 0 0 0 2px #22c55e;
}

.home-map-node-icon {
  display: block;
  box-sizing: border-box;
  width: 36px;
  height: 36px;
  padding: 9px;
  flex-shrink: 0;
  border-radius: 8px;
  background: #f3f4f6;
  color: #15803d;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.home-map-node--live:hover .home-map-node-icon {
  transform: translateY(-1px) scale(1.06);
}

html.dark .home-map-node-icon {
  background: #374151;
  color: #4ade80;
}

.home-map-node-label {
  box-sizing: border-box;
  width: 88px;
  margin: 0;
  overflow: hidden;
  font-size: 11px;
  line-height: 1.25;
  text-align: center;
  color: #1f2937;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  transition: color 0.15s ease;
}

html.dark .home-map-node-label {
  color: #e5e7eb;
}
</style>
