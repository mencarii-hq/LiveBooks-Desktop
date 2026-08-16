import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkNode } from 'elkjs';
import type {
  HomeMap,
  HomeMapLane,
  HomeMapNodeId,
  HomeMapPanelId,
} from 'src/utils/qbdFamiliarity';

/** Fixed node footprint (icon + up-to-two-line label) used for layout math. */
export const NODE_W = 92;
export const NODE_H = 72;

const IN_LAYER_GAP = 12;
const LAYER_GAP = 48;
const GRID_GAP_X = 12;
const GRID_GAP_Y = 10;
const GRID_COLS = 2;
const ISOLATED_GAP = 44;
const ISOLATED_NODE_GAP = 14;
const LANE_PAD_X = 16;
const LANE_PAD_TOP = 28;
const LANE_PAD_BOTTOM = 14;
const LANE_GAP = 32;
const COLUMN_GUTTER = 32;

/** QBD-familiar macro arrangement: activity lanes left, tool grids right. */
const LANE_COLUMN: Record<HomeMapPanelId, 'left' | 'right'> = {
  vendors: 'left',
  customers: 'left',
  employees: 'left',
  company: 'right',
  banking: 'right',
};

export interface PlacedNode {
  id: HomeMapNodeId;
  laneId: HomeMapPanelId;
  /** Offset from the lane's top-left corner. */
  x: number;
  y: number;
}

export interface PlacedLane {
  id: HomeMapPanelId;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface HomeMapLayout {
  lanes: PlacedLane[];
  nodes: PlacedNode[];
  width: number;
  height: number;
}

type EdgePair = [HomeMapNodeId, HomeMapNodeId];
type LaneContent = { nodes: PlacedNode[]; w: number; h: number };

function contentSize(nodes: { x: number; y: number }[]): {
  w: number;
  h: number;
} {
  let w = 0;
  let h = 0;
  for (const node of nodes) {
    w = Math.max(w, node.x + NODE_W);
    h = Math.max(h, node.y + NODE_H);
  }
  return { w, h };
}

/**
 * The rows grid encodes reading order; turn adjacency into layout-only edges
 * so ELK reproduces it (e.g. Receive Payments stays in the invoice layer)
 * without per-edge pixel nudges. Only real edges from the
 * map are ever rendered.
 */
function deriveLayoutEdges(rows: (HomeMapNodeId | null)[][]): EdgePair[] {
  const out: EdgePair[] = [];
  for (let r = 0; r < rows.length; r++) {
    for (let c = 1; c < rows[r].length; c++) {
      const to = rows[r][c];
      if (!to) {
        continue;
      }
      for (let rr = r; rr >= 0; rr--) {
        const from = rows[rr][c - 1];
        if (from) {
          out.push([from, to]);
          break;
        }
      }
    }
  }
  return out;
}

async function layoutFlowLane(
  elk: InstanceType<typeof ELK>,
  lane: HomeMapLane,
  realEdges: EdgePair[]
): Promise<LaneContent> {
  const ids = lane.rows.flat().filter((id): id is HomeMapNodeId => Boolean(id));
  const pairs = new Map<string, EdgePair>();
  for (const pair of [...realEdges, ...deriveLayoutEdges(lane.rows)]) {
    pairs.set(pair.join('->'), pair);
  }
  const graph: ElkNode = {
    id: lane.id,
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': String(IN_LAYER_GAP),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(LAYER_GAP),
      'elk.padding': '[top=0,left=0,bottom=0,right=0]',
    },
    children: ids.map((id) => ({ id, width: NODE_W, height: NODE_H })),
    edges: [...pairs.values()].map(([from, to]) => ({
      id: `${from}->${to}`,
      sources: [from],
      targets: [to],
    })),
  };
  const res = await elk.layout(graph);
  const nodes: PlacedNode[] = (res.children ?? []).map((child) => ({
    id: child.id as HomeMapNodeId,
    laneId: lane.id,
    x: child.x ?? 0,
    y: child.y ?? 0,
  }));
  return { nodes, ...contentSize(nodes) };
}

function layoutGridLane(lane: HomeMapLane): LaneContent {
  const rows: (HomeMapNodeId | null)[][] = lane.rows.map((row) => [...row]);
  const stack = lane.stackGrid ?? [];
  for (let i = 0; i < stack.length; i += GRID_COLS) {
    rows.push(stack.slice(i, i + GRID_COLS));
  }
  const nodes: PlacedNode[] = [];
  rows.forEach((row, r) => {
    row.forEach((id, c) => {
      if (!id) {
        return;
      }
      nodes.push({
        id,
        laneId: lane.id,
        x: c * (NODE_W + GRID_GAP_X),
        y: r * (NODE_H + GRID_GAP_Y),
      });
    });
  });
  return { nodes, ...contentSize(nodes) };
}

/** Nodes parked on the far right of a swimlane, past the flow content. */
function appendIsolated(lane: HomeMapLane, content: LaneContent): void {
  if (!lane.isolated.length) {
    return;
  }
  lane.isolated.forEach((id, i) => {
    content.nodes.push({
      id,
      laneId: lane.id,
      x: content.w + ISOLATED_GAP + i * (NODE_W + ISOLATED_NODE_GAP),
      y: 0,
    });
  });
  const size = contentSize(content.nodes);
  content.w = size.w;
  content.h = size.h;
}

/**
 * Compute the whole Home map geometry: ELK lays out each flow lane from its
 * edges, grids are packed two-wide, and lanes stack into the QBD-familiar
 * two-column arrangement. All routing hints (ports, nudges, gutters) are
 * gone; Vue Flow renders the edges from node positions alone.
 */
export async function layoutHomeMap(map: HomeMap): Promise<HomeMapLayout> {
  const elk = new ELK();
  const contents: { lane: HomeMapLane; content: LaneContent }[] = [];
  for (const lane of map.lanes) {
    const ids = new Set(lane.rows.flat().filter(Boolean));
    const content =
      lane.kind === 'flow'
        ? await layoutFlowLane(
            elk,
            lane,
            map.edges
              .filter((e) => ids.has(e.from) && ids.has(e.to))
              .map((e) => [e.from, e.to] as EdgePair)
          )
        : layoutGridLane(lane);
    appendIsolated(lane, content);
    contents.push({ lane, content });
  }

  const columns: Record<
    'left' | 'right',
    { lane: HomeMapLane; content: LaneContent }[]
  > = { left: [], right: [] };
  for (const entry of contents) {
    columns[LANE_COLUMN[entry.lane.id]].push(entry);
  }

  const laneW = (c: LaneContent) => c.w + LANE_PAD_X * 2;
  const laneH = (c: LaneContent) => c.h + LANE_PAD_TOP + LANE_PAD_BOTTOM;
  const leftW = Math.max(0, ...columns.left.map((e) => laneW(e.content)));
  const rightW = Math.max(0, ...columns.right.map((e) => laneW(e.content)));

  const lanes: PlacedLane[] = [];
  const nodes: PlacedNode[] = [];
  const placeColumn = (
    entries: { lane: HomeMapLane; content: LaneContent }[],
    x: number,
    w: number
  ): number => {
    let y = 0;
    for (const { lane, content } of entries) {
      lanes.push({ id: lane.id, x, y, w, h: laneH(content) });
      for (const node of content.nodes) {
        nodes.push({
          ...node,
          x: node.x + LANE_PAD_X,
          y: node.y + LANE_PAD_TOP,
        });
      }
      y += laneH(content) + LANE_GAP;
    }
    return Math.max(0, y - LANE_GAP);
  };
  const leftH = placeColumn(columns.left, 0, leftW);
  const rightH = placeColumn(columns.right, leftW + COLUMN_GUTTER, rightW);

  return {
    lanes,
    nodes,
    width: leftW + COLUMN_GUTTER + rightW,
    height: Math.max(leftH, rightH),
  };
}

/** Grow each column's lanes so the map fills `targetHeight` without moving nodes. */
export function stretchHomeMapToHeight(
  layout: HomeMapLayout,
  targetHeight: number
): HomeMapLayout {
  if (targetHeight <= layout.height + 1) {
    return layout;
  }

  const lanes = layout.lanes.map((lane) => ({ ...lane }));
  const columns = new Map<number, PlacedLane[]>();
  for (const lane of lanes) {
    const col = columns.get(lane.x) ?? [];
    col.push(lane);
    columns.set(lane.x, col);
  }

  for (const col of columns.values()) {
    col.sort((a, b) => a.y - b.y);
    const last = col[col.length - 1];
    const colExtra = targetHeight - (last.y + last.h);
    if (colExtra <= 1) {
      continue;
    }
    const grow = colExtra / col.length;
    let shift = 0;
    for (const lane of col) {
      lane.y += shift;
      lane.h += grow;
      shift += grow;
    }
  }

  return { ...layout, lanes, height: targetHeight };
}
