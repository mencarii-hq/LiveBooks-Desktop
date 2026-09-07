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
        :zoom-on-pinch="false"
        :pan-on-scroll="false"
        :pan-on-drag="false"
        :min-zoom="MIN_ZOOM"
        :max-zoom="MAX_ZOOM"
        :fit-view-on-init="false"
        :translate-extent="translateExtent"
        @nodes-initialized="applyFrame"
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

/** Slack around the laid-out map if a window is too small to fit at min zoom. */
const PAN_PAD = 560;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 1.5;
const FRAME_PAD = 24;
const UNBOUNDED_EXTENT: [[number, number], [number, number]] = [
  [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
  [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
];

export default defineComponent({
  name: 'HomeWorkflowMap',
  components: { PageHeader, FeatherIcon, VueFlow, Handle },
  setup() {
    const { setViewport } = useVueFlow('home-map');
    return {
      setViewport,
      Position,
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
      resizeObserver: null as ResizeObserver | null,
      frameRaf: null as number | null,
    };
  },
  async mounted() {
    await this.buildElements();
    await this.$nextTick();
    this.applyFrame();
    const wrap = this.$el?.querySelector?.(
      '.home-map-wrap'
    ) as HTMLElement | null;
    if (wrap && typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.scheduleFrame());
      this.resizeObserver.observe(wrap);
    }
  },
  beforeUnmount() {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.frameRaf != null) {
      cancelAnimationFrame(this.frameRaf);
      this.frameRaf = null;
    }
  },
  methods: {
    isLive: isHomeMapNodeLive,
    scheduleFrame() {
      if (this.frameRaf != null) {
        return;
      }
      this.frameRaf = window.requestAnimationFrame(() => {
        this.frameRaf = null;
        this.applyFrame();
      });
    },
    applyFrame() {
      const wrap = this.$el?.querySelector?.(
        '.home-map-wrap'
      ) as HTMLElement | null;
      if (
        !this.baseLayout ||
        !wrap ||
        wrap.clientWidth < 10 ||
        wrap.clientHeight < 10
      ) {
        return;
      }

      const widthZoom = (wrap.clientWidth - FRAME_PAD) / this.baseLayout.width;
      const heightZoom =
        (wrap.clientHeight - FRAME_PAD) / this.baseLayout.height;
      const zoom =
        Math.round(
          Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(widthZoom, heightZoom))) *
            20
        ) / 20;
      void this.setViewport({
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
  cursor: default;
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
