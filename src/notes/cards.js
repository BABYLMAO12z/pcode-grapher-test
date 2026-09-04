/* =========================================================================
 * PCODE Grapher · src/notes/cards.js — dựng NODE note cho React Flow (D7)
 *
 * Bản cũ (notes-card.js) tự tính slot bằng pickCardSlot/rectOverlapsAny và tự
 * vẽ nét nối bằng path SVG. Trong v2 card note LÀ MỘT NODE của React Flow nên
 * chỉ cần tính TOẠ ĐỘ; việc vẽ/pan/zoom do React Flow lo (bỏ ~250 dòng DOM).
 * Thuật toán chọn chỗ (slot phải-trên trước, né block, 4 ứng viên) GIỮ NGUYÊN.
 * ========================================================================= */

import { NOTE_PANEL_W } from '../graph/constants.js';

export const NOTE_GAP = 12;
export const NOTE_STATE_LABEL = { ok: '✓ khớp', stale: '⚠ code đã đổi', orphan: '✗ không tìm thấy' };
export const NOTE_STATE_ICON = { ok: '✓', stale: '⚠', orphan: '✗' };

/** Ước lượng cao ô note (port estimateNoteDims — dùng khi chưa đo được DOM). */
let npHost = null;
function npMeasureHost() {
  if (typeof document === 'undefined' || !document.body) return null;
  if (npHost && document.body.contains(npHost)) return npHost;
  npHost = document.createElement('div');
  npHost.id = 'noteMeasureHost';
  npHost.style.cssText = 'position:absolute;left:-99999px;top:0;visibility:hidden;pointer-events:none;contain:layout style;';
  document.body.appendChild(npHost);
  return npHost;
}
const npCache = new Map();
export function estimateNoteDims(saved) {
  const note = String(saved.note == null ? '' : saved.note);
  const plain = String(saved.plain == null ? '' : saved.plain);
  // C7: heuristic 40 ký tự/dòng sai với text wrap thật (tiếng Việt/từ dài) →
  // reserve lệch, panel tràn/hụt. Đo DOM ẨN với đúng class CSS của NotePanelNode;
  // heuristic chỉ còn là fallback cho test/jsdom.
  const host = npMeasureHost();
  if (host) {
    const key = note + '\u0000' + plain;
    const hit = npCache.get(key);
    if (hit) return hit;
    const el = document.createElement('div');
    el.className = 'notePanel ok';
    el.style.width = NOTE_PANEL_W + 'px';
    const head = document.createElement('div');
    head.className = 'np-head';
    head.innerHTML = '<span class="np-ref">B99</span><span class="np-st ok">✓</span>';
    const body = document.createElement('div');
    body.className = 'np-note';
    body.textContent = note;
    el.appendChild(head);
    el.appendChild(body);
    if (plain) {
      const pl = document.createElement('div');
      pl.className = 'np-plain';
      pl.textContent = plain;
      el.appendChild(pl);
    }
    host.appendChild(el);
    const h = el.offsetHeight;
    host.removeChild(el);
    if (h > 0) {
      const dims = { w: NOTE_PANEL_W, h: h + 4 };
      if (npCache.size > 800) npCache.clear();
      npCache.set(key, dims);
      return dims;
    }
  }
  const cpl = 40; // ký tự/dòng trong ~268px nội dung
  const lines = (s) => Math.max(1, Math.ceil(String(s == null ? '' : s).length / cpl));
  const h = 8 + 9 + 4 // padding + border (1 + 3 accent)
    + 24 // .np-head
    + lines(saved.note) * 22 // .np-note
    + (saved.plain ? 8 + lines(saved.plain) * 19 : 0) // .np-plain
    + 10; // an toàn
  return { w: NOTE_PANEL_W, h };
}

/** Ước lượng cao CARD (port estimateCardDims). */
export function estimateCardDims(o, graphData) {
  const cpl = 38;
  const lines = (s) => Math.max(1, Math.ceil(String(s == null ? '' : s).length / cpl));
  const saved = (o && o.data) || {};
  let outs = 0;
  if (o && o.type === 'node' && graphData && graphData.edges) {
    for (const e of graphData.edges) if (e.from === o.nid) outs++;
  }
  const h = 38 + 14 + 64 + 14
    + lines(saved.note || '') * 23
    + (saved.plain ? 10 + lines(saved.plain) * 20 : 0)
    + (outs ? 20 + outs * 28 : 0)
    + 52;
  return { w: NOTE_PANEL_W, h };
}

/** Vùng dự trù chỗ cho ô note (mode full) — layout đọc để không đè block. */
export function prepareNoteReserves(notes, graphData, notesMode) {
  const reserve = {};
  if (notesMode !== 'full' || !notes || !notes.match || !graphData) return reserve;
  const savedByRef = {};
  (notes.blocks || []).forEach((b) => { savedByRef[b.ref] = b; });
  for (const n of graphData.nodes || []) {
    const savedRef = notes.match.nodeToSavedRef[n.id];
    if (!savedRef) continue;
    const saved = savedByRef[savedRef];
    if (!saved || !saved.note) continue;
    // B7: dự trù theo Ô NOTE (thứ hiển thị thường trực) — không max với CARD
    // (chỉ mở 1 cái lúc click, cao gấp 2-3 lần) kẻo mode full giãn hàng cực xa.
    const pd = estimateNoteDims(saved);
    reserve[n.id] = { w: NOTE_PANEL_W, h: pd.h };
  }
  return reserve;
}

/* ------------------------- chọn chỗ đặt card ---------------------------- */

export function rectOverlapsAny(r, blocks, selfId, margin) {
  for (const b of blocks) {
    if (b.id === selfId) continue;
    if (r.x < b.x + b.w + margin && b.x < r.x + r.w + margin &&
        r.y < b.y + b.h + margin && b.y < r.y + r.h + margin) return true;
  }
  return false;
}

export function overlapAreaWithAll(r, blocks, selfId) {
  let s = 0;
  for (const b of blocks) {
    if (b.id === selfId) continue;
    const w = Math.min(r.x + r.w, b.x + b.w) - Math.max(r.x, b.x);
    const h = Math.min(r.y + r.h, b.y + b.h) - Math.max(r.y, b.y);
    if (w > 0 && h > 0) s += w * h;
  }
  return s;
}

export function bestCardCandidate(cands, blocks, selfId, cw, ch) {
  let best = null, bestScore = Infinity;
  for (let i = 0; i < cands.length; i++) {
    const ov = overlapAreaWithAll({ x: cands[i].x, y: cands[i].y, w: cw, h: ch }, blocks, selfId);
    const score = ov + i * 0.01;
    if (score < bestScore) { bestScore = score; best = cands[i]; if (ov === 0) break; }
  }
  return best;
}

/**
 * Port pickCardSlot: slot dự trù (phải-trên) trước, kẹt thì dò 4 góc.
 * @param {object} anchor {type:'node',nid} | {type:'edge',idx}
 * @param {Array} blocks [{id,x,y,w,h}]
 */
export function pickCardSlot(anchor, cw, ch, blocks, ctx = {}) {
  const { noteReserve = {}, graphData = null } = ctx;
  const GAP = NOTE_GAP;
  if (anchor.type === 'node') {
    const b = blocks.find((x) => x.id === anchor.nid);
    if (!b) return null;
    // 1) SLOT đã dự trù (mode full): cạnh PHẢI block, canh GÓC TRÊN.
    if (noteReserve && noteReserve[b.id]) {
      const slot = { x: b.x + b.w + GAP, y: b.y, w: cw, h: ch, side: 'R', ax: b.x + b.w, ay: b.y };
      if (!rectOverlapsAny(slot, blocks, b.id, 4)) return slot;
    }
    // 2) không có slot / slot bị chiếm → dò 4 góc quanh block
    const cands = [
      { x: b.x + b.w + GAP, y: b.y, side: 'R', ax: b.x + b.w, ay: b.y },
      { x: b.x - cw - GAP, y: b.y, side: 'L', ax: b.x, ay: b.y },
      { x: b.x, y: b.y + b.h + GAP, side: 'B', ax: b.x, ay: b.y + b.h },
      { x: b.x + b.w - cw, y: b.y + b.h + GAP, side: 'Br', ax: b.x + b.w, ay: b.y + b.h },
    ];
    const pick = bestCardCandidate(cands, blocks, b.id, cw, ch);
    return pick ? { ...pick, w: cw, h: ch } : null;
  }
  // Card EDGE: nguồn = trung điểm 2 node (React Flow tự route nét nối).
  const ed = graphData && (graphData.edges || [])[anchor.idx];
  if (!ed) return null;
  const a = blocks.find((x) => x.id === ed.from);
  const z = blocks.find((x) => x.id === ed.to);
  if (!a || !z) return null;
  const gx = (a.x + a.w / 2 + z.x + z.w / 2) / 2;
  const gy = (a.y + a.h / 2 + z.y + z.h / 2) / 2;
  const cands = [
    { x: gx + GAP, y: gy, side: 'R', ax: gx, ay: gy },
    { x: gx - GAP - cw, y: gy, side: 'L', ax: gx, ay: gy },
    { x: gx, y: gy + GAP, side: 'B', ax: gx, ay: gy },
    { x: gx - cw / 2, y: gy - GAP - ch, side: 'T', ax: gx, ay: gy },
  ];
  const pick = bestCardCandidate(cands, blocks, null, cw, ch);
  return pick ? { ...pick, w: cw, h: ch } : null;
}

/** rect của mọi block, lấy từ node React Flow đang có. */
export function blockRectsFrom(rfNodes) {
  const out = [];
  for (const n of rfNodes || []) {
    if (!n.data || !n.data.cfgNode) continue;
    out.push({
      id: n.data.cfgNode.id,
      x: n.position.x, y: n.position.y,
      w: n.width || n.measured?.width || 220,
      h: n.height || n.measured?.height || 60,
    });
  }
  return out;
}

/**
 * Ô note cạnh block (mode full) → node React Flow type 'notePanel'.
 * Flip sang trái khi vượt biên phải của graph (port nhánh stageW của renderNotes).
 */
export function buildNotePanelNodes(notes, notesMode, rfNodes, opts = {}) {
  if (notesMode !== 'full' || !notes || !notes.match) return [];
  const blocks = blockRectsFrom(rfNodes);
  const savedByRef = {};
  (notes.blocks || []).forEach((b) => { savedByRef[b.ref] = b; });
  const out = [];
  for (const b of blocks) {
    const savedRef = notes.match.nodeToSavedRef[b.id];
    if (!savedRef) continue;
    const saved = savedByRef[savedRef];
    if (!saved || !saved.note) continue;
    const st = (notes.match.byRef[savedRef] || {}).state || 'orphan';
    const pd = estimateNoteDims(saved);
    let px = b.x + b.w + NOTE_GAP;
    // C5/L8: slot phải bị block khác chiếm (hoặc vượt stageW nếu caller truyền)
    // → flip sang TRÁI như bản cũ, miễn bên trái trống.
    /* FIX(8): trước đây `overStage ||` cho phép lật sang trái MÀ KHÔNG kiểm tra
     * bên trái có trống không → ô note đè lên block khác. Giờ luôn đánh giá cả
     * hai phía và chọn phía trống; nếu cả hai đều vướng thì ưu tiên phía không
     * tràn stage, hoà thì giữ bên phải (hành vi mặc định cũ). */
    const overStage = !!(opts.stageW && px + NOTE_PANEL_W > opts.stageW);
    const lx = b.x - NOTE_PANEL_W - NOTE_GAP;
    const rBlocked = rectOverlapsAny({ x: px, y: b.y, w: NOTE_PANEL_W, h: pd.h }, blocks, b.id, 4);
    const lBlocked = rectOverlapsAny({ x: lx, y: b.y, w: NOTE_PANEL_W, h: pd.h }, blocks, b.id, 4);
    const lOffStage = lx < 0;
    if (overStage || rBlocked) {
      const rCost = (rBlocked ? 2 : 0) + (overStage ? 1 : 0);
      const lCost = (lBlocked ? 2 : 0) + (lOffStage ? 1 : 0);
      if (lCost < rCost) px = lx;
    }
    out.push({
      id: 'np' + b.id,
      type: 'notePanel',
      position: { x: px, y: b.y },
      width: NOTE_PANEL_W,
      // U2: .notePanel là position:absolute nên wrapper KHÔNG tự cao (đo được
      // h=0) — RF cần height thật để culling (onlyRenderVisibleElements) không
      // nhầm ô note là "ngoài khung nhìn" và hidden/kéo-đi đúng vùng.
      height: pd.h,
      draggable: false,
      selectable: false,
      connectable: false,
      data: { savedRef, state: st, note: saved.note, plain: saved.plain || '', manual: !!saved.manual, nid: b.id },
    });
  }
  return out;
}

/**
 * Card đang mở → 1 node 'noteCard' + 1 edge 'noteConn' nối về block/edge gốc.
 * Trả [] khi không có card (đóng card = biến mất khỏi graph, không leak DOM).
 */
export function buildCardNodes(anchor, savedRef, notes, rfNodes, ctx = {}) {
  if (!anchor || !savedRef || !notes || !notes.match) return { nodes: [], edges: [] };
  const isEdge = anchor.type === 'edge';
  const list = isEdge ? notes.edges || [] : notes.blocks || [];
  const saved = list.find((x) => x.ref === savedRef);
  if (!saved) return { nodes: [], edges: [] };
  const byRef = isEdge ? notes.match.edgeByRef : notes.match.byRef;
  const state = (byRef[savedRef] || {}).state || 'orphan';

  const blocks = blockRectsFrom(rfNodes);
  const o = { type: anchor.type, nid: anchor.nid, idx: anchor.idx, savedRef, state, data: saved };
  const ch = estimateCardDims(o, ctx.graphData).h;
  // B5: user đã kéo card đi → tôn trọng vị trí đó, không pickCardSlot lại
  const slot = ctx.cardPos
    ? { x: ctx.cardPos.x, y: ctx.cardPos.y, w: NOTE_PANEL_W, h: ch, side: 'R' }
    : pickCardSlot(anchor, NOTE_PANEL_W, ch, blocks, ctx);
  if (!slot) return { nodes: [], edges: [] };

  const cardNode = {
    id: 'nc',
    type: 'noteCard',
    position: { x: slot.x, y: slot.y },
    width: NOTE_PANEL_W,
    draggable: true,
    // U5: kéo card CHỈ qua header (.nc-head). Bản 1.9.3 (interact.js) loại
    // #noteLayer khỏi mọi gesture board để mousedown trên card KHÔNG bị
    // preventDefault → bôi đen text note hoạt động. Bản React dùng XYFlow:
    // d3-drag ăn mousedown cả thân card → text KHÔNG select được. dragHandle
    // giới hạn điểm bắt đầu drag về header — thân card tự do select/copy.
    dragHandle: '.nc-head',
    selectable: false,
    connectable: false,
    zIndex: 1000,
    data: { ...o, side: slot.side },
  };
  // nối về block gốc (card edge: nối tới node nguồn của cạnh)
  const srcNid = isEdge
    ? (ctx.graphData && (ctx.graphData.edges || [])[anchor.idx] || {}).from
    : anchor.nid;
  const edges = srcNid == null ? [] : [{
    id: 'nconn',
    source: 'n' + srcNid,
    target: 'nc',
    type: 'noteConn',
    selectable: false,
    zIndex: 999,
    data: {},
  }];
  return { nodes: [cardNode], edges };
}
