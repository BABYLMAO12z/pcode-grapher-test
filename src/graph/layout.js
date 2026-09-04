/* =========================================================================
 * PCODE Grapher · src/graph/layout.js — layout adapter (SPEC §5, TASKS T3)
 *
 * Thay js/ui/graph.js phần layout:
 *   · measureNodes  — đo node bằng DOM ẩn (giữ kỹ thuật cũ: 1 nguồn sự thật cho text)
 *   · cfgToElkGraph — GIỮ NGUYÊN VĂN layoutOptions của bản cũ
 *   · ELK ≤ 400 block · dagre > 400 (D3) · fallback lưới khi cả hai fail
 *   · manualPos ghi đè vị trí; bounds/stats cho fitView + statusbar
 *
 * BỎ so với bản cũ (React Flow lo): snapEdgeEndsToBlocks, elkSectionToPoints,
 * roundPath, mkDefs, makeEdgeLabel — RF tự route + vẽ nhãn edge.
 * ========================================================================= */

import { lineClass, lineHTML, lineText } from '../ui/tokens.js';
import { fnv1a } from '../core/anchors.js';
import { isEntryNode } from '../core/cfg.js';
import {
  PRESETS, COLLAPSE_AT, HEAD_L, TAIL_L, collapsibleBlock,
  DAGRE_AT, NOTE_GAP_PX, LN_H, nodeHeightFromLines,
} from './constants.js';

/* ------------------------------ ELK ---------------------------------- */

let elkInstance = null;
/* FIX(18): trước đây MỘT lần ELK lỗi là `elkFailed = true` VĨNH VIỄN — cả phiên
 * còn lại rơi xuống dagre (bố cục xấu hơn, mất route tránh block) kể cả khi lỗi
 * chỉ do một đồ thị cá biệt. Giờ đếm số lần lỗi LIÊN TIẾP: chỉ tắt ELK sau
 * ELK_FAIL_MAX lần và bật lại ngay khi có một lần layout ELK thành công. */
const ELK_FAIL_MAX = 3;
let elkFails = 0;
const elkDisabled = () => elkFails >= ELK_FAIL_MAX;

/** elkjs nạp động → tách chunk, không chặn first paint (T12 bundle). */
export async function getElk() {
  if (elkInstance) return elkInstance;
  const mod = await import('elkjs/lib/elk.bundled.js');
  const ELK = mod.default || mod;
  elkInstance = new ELK();
  return elkInstance;
}

/** Chỉ để test tiêm giả lập / reset giữa các test. */
export function _setElkForTest(inst) {
  elkInstance = inst;
  elkFails = 0;
}

/* --------------------------- ref map B# ------------------------------ */

/* Nhãn block PHẢI trùng ref mà AI notes / AI data dùng: B1..Bn theo THỨ TỰ
 * block (buildAnchors), KHÔNG phải n.id (0-based, có khoảng trống sau collapse).
 * Port nguyên văn rebuildNodeRefMap/blockRefOf của graph.js. */
export function rebuildNodeRefMap(graphData) {
  const map = {};
  const ns = (graphData && graphData.nodes) || [];
  ns.forEach((n, i) => {
    map[n.id] = 'B' + (i + 1);
  });
  return map;
}

export function blockRefOf(nodeRefMap, graphData, nid) {
  if (nodeRefMap && nodeRefMap[nid]) return nodeRefMap[nid];
  const ns = (graphData && graphData.nodes) || [];
  for (let i = 0; i < ns.length; i++) if (ns[i].id === nid) return 'B' + (i + 1);
  return '#' + nid;
}

/* ----------------------- đo node bằng DOM ẩn -------------------------- */

const MEASURE_HOST_ID = 'measureHost';

export function getMeasureHost() {
  if (typeof document === 'undefined') return null;
  let host = document.getElementById(MEASURE_HOST_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = MEASURE_HOST_ID;
    host.setAttribute('aria-hidden', 'true');
    // style inline để đo được cả khi CSS chưa nạp (test/jsdom)
    host.style.cssText =
      'position:absolute;left:-99999px;top:0;visibility:hidden;pointer-events:none';
    document.body.appendChild(host);
  }
  return host;
}

export function destroyMeasureHost() {
  const host = typeof document !== 'undefined' && document.getElementById(MEASURE_HOST_ID);
  if (host && host.parentNode) host.parentNode.removeChild(host);
}

/** HTML nội dung block — DÙNG CHUNG với CfgNode.jsx để đo == render (T4). */
export function nodeInnerHTML(n, { colorVars = true, expanded = false, ref = '', liveNames = null } = {}) {
  const seqBg = n.lines.some((l) => l.ctl);
  const renderLn = (ln) =>
    '<div class="' + lineClass(ln, seqBg) + '">' + (lineHTML(ln, colorVars, liveNames) || '&nbsp;') + '</div>';
  const tot = n.lines.length;
  let inner;
  if (collapsibleBlock(n)) {
    inner = n.lines.slice(0, HEAD_L).map(renderLn).join('');
    inner +=
      '<div class="coll"' + (expanded ? '' : ' style="display:none"') + '>' +
      n.lines.slice(HEAD_L, tot - TAIL_L).map(renderLn).join('') +
      '</div>';
    inner += n.lines.slice(tot - TAIL_L).map(renderLn).join('');
    inner +=
      '<div class="more">' +
      (expanded
        ? '▴ thu gọn (' + tot + ' dòng)'
        : '▾ mở rộng — đang ẩn ' + (tot - HEAD_L - TAIL_L) + ' dòng') +
      '</div>';
  } else {
    inner = n.lines.map(renderLn).join('');
  }
  const tag = (ref || '') + (isEntryNode(n) ? ' · ENTRY' : '');
  inner += '<span class="tag">' + tag + '</span>';
  return inner;
}

/** class ngoài của block — dùng chung với CfgNode.jsx. */
export function nodeClassName(n) {
  return (
    'node k-' + n.kind +
    (n.ctag ? ' c-' + n.ctag : '') +
    (n.flags && n.flags.terminal ? ' terminal' : '') +
    (n.flags && n.flags.tail ? ' tail' : '')
  );
}

/** Text thuần của block (copy / export / AI data). Port nodePlain của graph.js. */
export function nodePlainText(n) {
  return n.lines.map(lineText).join('\n');
}

/* Cache theo `id|expanded|width|theme|preset` (SPEC §6.1) — chỉ hover thì
 * không đo lại, chỉ đo lại khi các yếu tố ảnh hưởng kích thước đổi. */
const measureCache = new Map();
/* FIX(17): cache đo KHÔNG có trần → mỗi lần sửa code rồi Build lại sinh key mới
 * (id|expanded|theme|preset|hash HTML) và không bao giờ bị dọn; phiên làm việc
 * dài với hàm lớn giữ hàng chục nghìn entry trong RAM. Giới hạn như _reCache. */
const MEASURE_CACHE_MAX = 4000;

export function clearMeasureCache() {
  measureCache.clear();
}

/* contentHash PHẢI là hash thật của HTML (fnv1a), không phải html.length như
 * trước: hai block khác nhau nhưng tình cờ cùng độ dài HTML (đổi hàm, node id
 * trùng) sẽ dùng lại size sai → block chồng nhau ngẫu nhiên, chỉ hết khi F5. */
function cacheKeyOf(n, ctx, contentHash) {
  return [n.id, ctx.expanded[n.id] ? 1 : 0, ctx.colorVars ? 1 : 0, ctx.theme, ctx.preset, contentHash].join('|');
}

/* jsdom không có layout engine (offsetWidth = 0). Ước lượng theo text để test
 * và ELK vẫn chạy đúng logic — trên trình duyệt luôn dùng số đo thật. */
function estimateSize(n, expandedFlag) {
  const CH_W = 7.6; // 12.5px monospace
  const lines = n.lines.map(lineText);
  let shown = lines;
  if (collapsibleBlock(n) && !expandedFlag) {
    shown = lines.slice(0, HEAD_L).concat(lines.slice(lines.length - TAIL_L));
  }
  const maxLen = shown.reduce((m, s) => Math.max(m, s.length), 0);
  return {
    width: Math.round(Math.max(60, maxLen * CH_W) + 22), // padding 8px 11px
    height: nodeHeightFromLines(n, expandedFlag),        // FIX(35): theo SỐ DÒNG
  };
}

/**
 * Đo kích thước mọi node bằng DOM ẩn.
 * @returns {Record<nodeId, {width:number, height:number}>}
 */
export function measureNodes(graphData, ctx) {
  const {
    colorVars = true, expanded = {}, theme = 'dark', preset = 'normal',
    nodeRefMap = {}, useCache = true, liveNames = null,
  } = ctx || {};
  const c = { colorVars, expanded, theme, preset };
  const out = {};
  const host = getMeasureHost();
  const nodes = (graphData && graphData.nodes) || [];

  for (const n of nodes) {
    const isExp = !!expanded[n.id];
    const html = nodeInnerHTML(n, { colorVars, expanded: isExp, ref: nodeRefMap[n.id] || '', liveNames });
    const key = cacheKeyOf(n, c, fnv1a(html));
    if (useCache && measureCache.has(key)) {
      out[n.id] = measureCache.get(key);
      continue;
    }
    /* FIX(35): CHIỀU CAO không lấy từ số đo DOM nữa mà tính từ SỐ DÒNG code
     * (nodeHeightFromLines, khớp CSS --ln-h/.more). Số đo DOM phụ thuộc font đã
     * nạp xong hay chưa, zoom chữ của trình duyệt, CSS về trễ… mà mũi tên trong
     * layout TB bám đúng mép TRÊN/DƯỚI node ⇒ sai chiều cao là mũi tên rời khỏi
     * block ngay. Bề rộng vẫn đo DOM (phụ thuộc nội dung/ligature, không có công
     * thức chuẩn) — sai bề rộng chỉ lệch nhẹ theo phương ngang. */
    const hFromLines = nodeHeightFromLines(n, isExp);
    let size = null;
    if (host) {
      const el = document.createElement('div');
      el.className = nodeClassName(n);
      el.innerHTML = html;
      host.appendChild(el);
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      host.removeChild(el);
      if (w > 0) size = { width: w, height: hFromLines };
      // lệch > 1 dòng ⇒ CSS và hằng số hình học đã lệch nhau, cần biết ngay
      if (h > 0 && Math.abs(h - hFromLines) > LN_H && ctx && ctx.onLog) {
        ctx.onLog('measure: block ' + n.id + ' cao ' + h + 'px nhưng theo số dòng là ' + hFromLines + 'px');
      }
    }
    if (!size) size = estimateSize(n, isExp);
    if (useCache) {
      if (measureCache.size >= MEASURE_CACHE_MAX) measureCache.clear();
      measureCache.set(key, size);
    }
    out[n.id] = size;
  }
  return out;
}

/* --------------------------- cfg → ELK -------------------------------- */

/**
 * GIỮ NGUYÊN VĂN layoutOptions của js/ui/graph.js (FILE-MAP §B).
 * Khác duy nhất: kích thước node lấy từ `sizes` (đo trước) thay vì nodeEls[].
 */
export function cfgToElkGraph(cfgData, { preset = 'normal', rankdir = 'TB', sizes = {}, noteReserve = {} } = {}) {
  const P = PRESETS[preset] || PRESETS.normal;

  const elkGraph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': rankdir === 'LR' ? 'RIGHT' : 'DOWN',
      'elk.spacing.nodeNode': String(P.nodesep),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(P.ranksep),
      'elk.layered.spacing.edgeNodeBetweenLayers': String(P.edgesep),
      'elk.layered.edgeSpacing': String(P.edgesep),
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.cycleBreaking.strategy': 'DEPTH_FIRST',
      'elk.layered.contentAlignment': 'V_CENTER H_CENTER',
      'elk.layered.layering.strategy': 'NETWORK_SIMPLEX',
      'elk.padding': '[top=24,left=24,bottom=24,right=24]',
      'elk.layered.compaction.postCompaction.strategy': 'EDGE_LENGTH',
      'elk.layered.mergeEdges': 'false',
      'elk.layered.wrapping.strategy': 'OFF',
    },
    children: [],
    edges: [],
  };

  // mode full: node = BLOCK + Ô NOTE (vùng dự trù noteReserve) → ELK coi là một
  // khối, không xếp block khác vào vùng note.
  const noteW = NOTE_GAP_PX;
  for (const n of cfgData.nodes) {
    const s = sizes[n.id];
    if (!s) continue;
    const rv = noteReserve ? noteReserve[n.id] : null;
    elkGraph.children.push({
      id: 'n' + n.id,
      width: s.width + (rv ? noteW + rv.w : 0),
      height: rv ? Math.max(s.height, rv.h) : s.height,
      labels: [],
    });
  }

  cfgData.edges.forEach((e, i) => {
    elkGraph.edges.push({
      id: 'e' + i,
      sources: ['n' + e.from],
      targets: ['n' + e.to],
      labels: e.elabel ? [{ text: e.elabel }] : [],
    });
  });

  return elkGraph;
}

/* ------------------- route edge của ELK (A1/A3) ------------------------ */

/* Bản cũ có elkSectionToPoints + snapEdgeEndsToBlocks; v2 từng vứt bỏ toàn bộ
 * sections của ELK rồi để React Flow tự vẽ smoothstep — không né vật cản nên
 * mũi tên xuyên block, edge song song trùng khít. Khôi phục: giữ waypoints ELK
 * làm đường vẽ thật, CfgEdge chỉ fallback smoothstep khi không có route. */

/** layouted (kết quả elk.layout) → { edgeIndex: [{x,y}, ...] } (toạ độ root). */
export function elkRoutePoints(layouted) {
  const routes = {};
  for (const ee of (layouted && layouted.edges) || []) {
    const idx = parseInt(String(ee.id).substring(1), 10);
    if (!Number.isFinite(idx)) continue;
    const pts = [];
    const push = (p) => {
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
      const last = pts[pts.length - 1];
      if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) return;
      pts.push({ x: p.x, y: p.y });
    };
    for (const s of ee.sections || []) {
      push(s.startPoint);
      for (const b of s.bendPoints || []) push(b);
      push(s.endPoint);
    }
    if (pts.length >= 2) routes[idx] = pts;
  }
  return routes;
}

/** Điểm p → điểm gần nhất TRÊN BIÊN rect (chừa pad ở góc cho mũi tên). */
export function snapToRect(p, r, pad = 6) {
  const cx = Math.min(Math.max(p.x, r.x), r.x + r.w);
  const cy = Math.min(Math.max(p.y, r.y), r.y + r.h);
  const dL = cx - r.x, dR = r.x + r.w - cx;
  const dT = cy - r.y, dB = r.y + r.h - cy;
  const m = Math.min(dL, dR, dT, dB);
  const q = { x: cx, y: cy };
  if (m === dT) q.y = r.y;
  else if (m === dB) q.y = r.y + r.h;
  else if (m === dL) q.x = r.x;
  else q.x = r.x + r.w;
  const padX = Math.min(pad, r.w / 2), padY = Math.min(pad, r.h / 2);
  if (q.y === r.y || q.y === r.y + r.h) q.x = Math.min(Math.max(q.x, r.x + padX), r.x + r.w - padX);
  else q.y = Math.min(Math.max(q.y, r.y + padY), r.y + r.h - padY);
  return q;
}

/* Kéo MỘT đầu route về biên rect thật, giữ các đoạn vuông góc:
 * đoạn kề là dọc → dịch x của bend kề theo x mới (và ngược lại). Route 2 điểm
 * thành chéo thì chêm 2 bend giữa theo trục dài hơn. Port tinh thần
 * snapEdgeEndsToBlocks của graph.js cũ (ô note phồng width làm điểm neo ELK
 * nằm ngoài block thật — thấy rõ nhất ở mode notes "full"). */
export function snapRouteEnd(pts, rect, atStart) {
  if (!pts || pts.length < 2 || !rect) return;
  const i0 = atStart ? 0 : pts.length - 1;
  const i1 = atStart ? 1 : pts.length - 2;
  const p = pts[i0], n = pts[i1];
  const q = snapToRect(p, rect);
  if (Math.abs(q.x - p.x) < 0.01 && Math.abs(q.y - p.y) < 0.01) return; // đã ở biên thật
  const wasVertical = Math.abs(p.x - n.x) < 0.01;
  const wasHorizontal = Math.abs(p.y - n.y) < 0.01;
  pts[i0] = q;
  if (pts.length === 2) {
    const a = pts[0], b = pts[1];
    if (Math.abs(a.x - b.x) > 0.01 && Math.abs(a.y - b.y) > 0.01) {
      if (Math.abs(b.y - a.y) >= Math.abs(b.x - a.x)) {
        const my = (a.y + b.y) / 2;
        pts.splice(1, 0, { x: a.x, y: my }, { x: b.x, y: my });
      } else {
        const mx = (a.x + b.x) / 2;
        pts.splice(1, 0, { x: mx, y: a.y }, { x: mx, y: b.y });
      }
    }
    return;
  }
  if (wasVertical) n.x = q.x;
  else if (wasHorizontal) n.y = q.y;
}

/** Snap 2 đầu mọi route về rect THẬT của block (không phải ô phồng noteReserve). */
export function snapRoutes(routes, cfgData, positions, sizes) {
  if (!routes) return routes;
  const rectOf = (id) => {
    const p = positions[id], s = sizes[id];
    return p && s ? { x: p.x, y: p.y, w: s.width, h: s.height } : null;
  };
  (cfgData.edges || []).forEach((e, i) => {
    const pts = routes[i];
    if (!pts) return;
    snapRouteEnd(pts, rectOf(e.from), true);
    snapRouteEnd(pts, rectOf(e.to), false);
  });
  return routes;
}

/* ------------------------------ dagre --------------------------------- */

async function dagreLayout(cfgData, { preset, rankdir, sizes, noteReserve }) {
  const mod = await import('@dagrejs/dagre');
  const dagre = mod.default || mod;
  const P = PRESETS[preset] || PRESETS.normal;

  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({
    rankdir: rankdir === 'LR' ? 'LR' : 'TB',
    nodesep: P.nodesep,
    ranksep: P.ranksep,
    edgesep: P.edgesep,
    marginx: 24,
    marginy: 24,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const n of cfgData.nodes) {
    const s = sizes[n.id];
    if (!s) continue;
    const rv = noteReserve ? noteReserve[n.id] : null;
    g.setNode('n' + n.id, {
      width: s.width + (rv ? NOTE_GAP_PX + rv.w : 0),
      height: rv ? Math.max(s.height, rv.h) : s.height,
    });
  }
  cfgData.edges.forEach((e, i) => {
    if (g.hasNode('n' + e.from) && g.hasNode('n' + e.to)) {
      g.setEdge('n' + e.from, 'n' + e.to, {}, 'e' + i);
    }
  });

  dagre.layout(g);

  const pos = {};
  for (const n of cfgData.nodes) {
    const nd = g.node('n' + n.id);
    if (!nd) continue;
    // dagre trả TÂM → đổi sang góc trái trên (SPEC §5.2)
    pos[n.id] = { x: nd.x - nd.width / 2, y: nd.y - nd.height / 2 };
  }
  return pos;
}

/* --------------------------- fallback lưới ----------------------------- */

/* Port fallbackLayout của graph.js: lưới an toàn khi CẢ ELK và dagre fail. */
export function gridLayout(cfgData, { sizes = {}, noteReserve = {} } = {}) {
  const nodes = cfgData.nodes || [];
  const cols = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
  /* FIX(28): bề rộng tính cho TỪNG CỘT (trước đây một `spacing` chung lấy theo
   * block RỘNG NHẤT toàn đồ thị, trong khi chiều cao đã tính theo từng hàng →
   * lưới dự phòng giãn ngang cực thưa, phải zoom out mới thấy). */
  const colW = [];
  nodes.forEach((n, i) => {
    const c = i % cols;
    const rv = noteReserve ? noteReserve[n.id] : null;
    const s = sizes[n.id];
    const w = s ? s.width + (rv ? NOTE_GAP_PX + rv.w : 0) : 160;
    colW[c] = Math.max(colW[c] || 120, w);
  });
  const colX = [];
  let cx = 24;
  for (let c = 0; c < cols; c++) { colX[c] = cx; cx += (colW[c] || 160) + 40; }
  // C3: chiều cao HÀNG theo block cao nhất của hàng (150 cứng làm block cao
  // hơn 150px chồng lên hàng dưới trong fallback grid).
  const rowH = [];
  nodes.forEach((n, i) => {
    const r = Math.floor(i / cols);
    const s = sizes[n.id];
    const rv = noteReserve ? noteReserve[n.id] : null;
    const h = Math.max(s ? s.height : 60, rv ? rv.h : 0);
    rowH[r] = Math.max(rowH[r] || 0, h);
  });
  const rowY = [];
  let y = 24;
  for (let r = 0; r < rowH.length; r++) {
    rowY[r] = y;
    y += (rowH[r] || 126) + 24;
  }
  const pos = {};
  nodes.forEach((n, i) => {
    pos[n.id] = { x: colX[i % cols], y: rowY[Math.floor(i / cols)] };
  });
  return pos;
}

/* ------------------------------ bounds -------------------------------- */

export function graphBounds(cfgData, pos, sizes, noteReserve) {
  // FIX(16): maxX/maxY phải khởi tạo -Infinity. Khởi tạo 0 khiến đồ thị nằm hoàn
  // toàn ở toạ độ ÂM (kéo block sang trái/lên trên rồi lưu manualPos) có bounds
  // kéo dài tới gốc 0,0 → fitView thu nhỏ quá mức và khung export thừa chỗ trống.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of (cfgData.nodes || [])) {
    const p = pos[n.id];
    const s = sizes[n.id];
    if (!p || !s) continue;
    const rv = noteReserve ? noteReserve[n.id] : null;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + s.width + (rv ? NOTE_GAP_PX + rv.w : 0));
    maxY = Math.max(maxY, p.y + Math.max(s.height, rv ? rv.h : 0));
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/* =======================================================================
 * layoutGraph — điểm vào chính
 * ======================================================================= */

let dagreNoticeLogged = false;
export function _resetDagreNotice() {
  dagreNoticeLogged = false;
}

/**
 * @returns {{positions, sizes, engine:'elk'|'dagre'|'grid', bounds, stats, ms}}
 */
export async function layoutGraph(cfgData, ctx = {}) {
  const {
    preset = 'normal', rankdir = 'TB', colorVars = true, expanded = {}, theme = 'dark',
    manualPos = {}, noteReserve = {}, nodeRefMap = {}, onLog,
    sizes: presetSizes = null, forceEngine = null, liveNames = null,
  } = ctx;

  const t0 = now();
  const nodes = (cfgData && cfgData.nodes) || [];
  const edges = (cfgData && cfgData.edges) || [];
  const sizes = presetSizes || measureNodes(cfgData, { colorVars, expanded, theme, preset, nodeRefMap, liveNames });

  let engine = forceEngine || (nodes.length > DAGRE_AT ? 'dagre' : 'elk');
  if (engine === 'elk' && elkDisabled() && !forceEngine) engine = 'dagre';

  if (engine === 'dagre' && !forceEngine && !dagreNoticeLogged) {
    dagreNoticeLogged = true; // D3: log ĐÚNG 1 LẦN
    log(onLog, `layout: ${nodes.length} block > ${DAGRE_AT} → dùng dagre thay ELK`);
  }

  let positions = null;
  let routes = {};
  const opts = { preset, rankdir, sizes, noteReserve };

  if (engine === 'elk') {
    try {
      const elk = await getElk();
      const layouted = await elk.layout(cfgToElkGraph(cfgData, opts));
      positions = {};
      for (const en of layouted.children || []) {
        positions[parseInt(en.id.substring(1), 10)] = { x: en.x, y: en.y };
      }
      // A1/A3: GIỮ waypoints ELK đã route (tránh cắt node/cắt nhau) rồi snap
      // 2 đầu về biên block THẬT (ô noteReserve phồng width làm ELK neo ra ngoài).
      routes = snapRoutes(elkRoutePoints(layouted), cfgData, positions, sizes);
      elkFails = 0; // thành công → xoá lịch sử lỗi
    } catch (err) {
      elkFails++;
      log(onLog, 'ELK layout error: ' + (err && err.message));
      positions = null;
      routes = {};
      engine = 'dagre';
    }
  }

  if (!positions && engine === 'dagre') {
    try {
      positions = await dagreLayout(cfgData, opts);
    } catch (err) {
      log(onLog, 'dagre layout error: ' + (err && err.message));
      positions = null;
      engine = 'grid';
    }
  }

  if (!positions) {
    engine = 'grid';
    positions = gridLayout(cfgData, opts);
  }

  // manualPos ghi đè — phải là số hữu hạn (session import tay / JSON cũ có thể
  // chứa NaN/null → node bay ra vô cực nếu không chặn). Port nguyên văn graph.js.
  // Node bị kéo tay lệch khỏi vị trí ELK → route ELK của các edge chạm nó đã
  // LỖI THỜI: xoá để CfgEdge fallback smoothstep bám theo vị trí thật.
  const movedNodes = new Set();
  for (const n of nodes) {
    const mp = manualPos[n.id];
    if (mp && Number.isFinite(mp.x) && Number.isFinite(mp.y)) {
      const ap = positions[n.id];
      if (!ap || Math.abs(ap.x - mp.x) > 0.5 || Math.abs(ap.y - mp.y) > 0.5) movedNodes.add(n.id);
      positions[n.id] = { x: mp.x, y: mp.y };
    }
    if (!positions[n.id]) { positions[n.id] = { x: 24, y: 24 }; movedNodes.add(n.id); }
  }
  if (movedNodes.size && routes) {
    edges.forEach((e, i) => {
      if (movedNodes.has(e.from) || movedNodes.has(e.to)) delete routes[i];
    });
  }

  return {
    positions,
    sizes,
    engine,
    routes,
    bounds: graphBounds(cfgData, positions, sizes, noteReserve),
    stats: nodes.length + ' blocks · ' + edges.length + ' edges',
    ms: now() - t0,
  };
}

/* ------------------------------ helpers -------------------------------- */

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
function log(onLog, msg) {
  if (typeof onLog === 'function') onLog(msg);
}

export { COLLAPSE_AT, HEAD_L, TAIL_L, DAGRE_AT };
