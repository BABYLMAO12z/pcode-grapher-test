/* =========================================================================
 * PCODE Grapher · src/notes/ui.js — hành vi Notes UI trên store (T7)
 * Port notes-card.js (openNote/closeOpenNote/applyNoteText/reopenCard/jumpToRef),
 * notes-hud.js (setNotesMode/cycleNotesMode/noteCounts) và notes-panel.js
 * (applyMainPath/clearMainPath) — bỏ toàn bộ thao tác DOM, chỉ đổi store.
 * ========================================================================= */

import { useStore } from '../store/useStore.js';
import { getAdjacency, getPlainText } from '../graph/build.js';
import { EDGE_PALETTES } from '../graph/constants.js';
import { syncEnvFromStore, pushEnvToStore } from './index.js';
import { saveNotes } from './store.js';
import { liveRenameMap, applyRenameMap } from './anchors.js';
import { computeMainPath } from './mainpath.js';
import { buildNotePanelNodes, buildCardNodes, prepareNoteReserves } from './cards.js';

export const NOTES_MODES = ['off', 'badge', 'full'];

/* Handlers card mặc định do App đăng ký 1 lần. refreshNoteNodes xây lại card
 * ở nhiều đường (đổi mode, setNotesMode, rename live, paneClick, jump…); nếu
 * lần nào đi qua đường KHÔNG có handlers thì card đang mở mất sạch nút bấm
 * (bản cũ handler sống trên DOM, không bao giờ mất). */
let defaultCardHandlers = {};
export function registerCardHandlers(h) { defaultCardHandlers = h || {}; }

/* ------------------------------- HUD ------------------------------------ */

/** Tổng hợp ✓/⚠/✗ cho HUD (port noteCounts). */
export function noteCounts(notes) {
  const c = (notes && notes.match && notes.match.counts) || null;
  if (!c) return null;
  const b = c.blocks || {}, e = c.edges || {};
  return {
    ok: (b.ok || 0) + (e.ok || 0),
    stale: (b.stale || 0) + (e.stale || 0),
    orphan: (b.orphan || 0) + (e.orphan || 0),
    bOk: b.ok || 0, eOk: e.ok || 0, bStale: b.stale || 0, bOrphan: b.orphan || 0,
  };
}

/**
 * Đổi mode notes. full ↔ không-full đổi vùng dự trù → cần layout lại (rebuild).
 * @returns {boolean} true nếu cần rebuild
 */
export function setNotesMode(mode, { quiet = false } = {}) {
  const s = useStore.getState();
  if (NOTES_MODES.indexOf(mode) < 0) return false;
  if (mode === s.notesMode) return false;
  if (!s.notes && mode !== 'off') {
    s.toast('Chưa có AI notes — bấm 📥 Notes để nạp');
    return false;
  }
  const wasFull = s.notesMode === 'full';
  useStore.setState({ notesMode: mode });
  // persist pcode.opts — bản cũ gọi saveState(); trước đây setState trần nên
  // mode notes mất sau reload.
  useStore.getState()._persistOpts(useStore.getState().opts);
  if (mode === 'off') closeNoteCard();
  // B6: đổi vùng dự trù ở CẢ 2 chiều (vào full = chừa chỗ; RA full = thu hồi
  // chỗ) — trước đây chỉ relayout khi VÀO full, thoát full để lại lỗ trống.
  const needRelayout = wasFull !== (mode === 'full');
  useStore.setState({
    noteReserve: mode === 'full' ? prepareNoteReserves(s.notes, s.graphData, 'full') : {},
  });
  if (!quiet) {
    s.toast('Notes: ' + { off: 'tắt', badge: 'badge ✓/⚠/✗', full: 'ô note cạnh block' }[mode]);
  }
  refreshNoteNodes();
  return needRelayout;
}

/** Phím N: off → badge → full → off (port cycleNotesMode). */
export function cycleNotesMode() {
  const s = useStore.getState();
  if (!s.notes) { s.toast('Chưa có AI notes — bấm 📥 Notes để nạp'); return false; }
  return setNotesMode(NOTES_MODES[(NOTES_MODES.indexOf(s.notesMode) + 1) % NOTES_MODES.length]);
}

/* --------------------------- node phụ trợ ------------------------------- */

/** Chỉ giữ node/edge của CFG (bỏ mọi node note cũ) — chống leak khi đổi hàm. */
function stripNoteNodes(nodes, edges) {
  return {
    nodes: (nodes || []).filter((n) => n.type === 'cfg'),
    edges: (edges || []).filter((e) => e.type === 'cfg'),
  };
}

/** Dữ liệu hiển thị cho card (code live, nhánh ra, link block) — port buildNoteCard. */
function cardViewData(anchor, savedRef, s) {
  const notes = s.notes;
  const isEdge = anchor.type === 'edge';
  const pal = EDGE_PALETTES[s.theme] || EDGE_PALETTES.dark;
  const liveMap = liveRenameMap();
  const out = { blockRef: s.nodeRefMap[anchor.nid] || 'B?', isLive: liveMap.size > 0 };
  if (!isEdge) {
    out.code = applyRenameMap(getPlainText(anchor.nid), liveMap);
    out.outs = ((s.graphData && s.graphData.edges) || [])
      .map((e, i) => ({ e, i }))
      .filter((x) => x.e.from === anchor.nid)
      .map(({ e, i }) => {
        const eRef = notes.match ? notes.match.edgeIdxToSavedRef[i] : null;
        const eSaved = eRef ? (notes.edges || []).find((x) => x.ref === eRef) : null;
        const sty = pal[e.kind] || pal.plain;
        return {
          idx: i, from: e.from, to: e.to, color: sty.col,
          kindLabel: sty.label || e.kind, note: eSaved ? eSaved.note : '',
        };
      });
  } else {
    const ed = ((s.graphData && s.graphData.edges) || [])[anchor.idx];
    const sty = ed ? pal[ed.kind] || pal.plain : pal.plain;
    out.edgeInfo = ed
      ? {
          kind: ed.kind, elabel: ed.elabel || '', color: sty.col,
          label: (s.nodeRefMap[ed.from] || '?') + ' → ' + (s.nodeRefMap[ed.to] || '?'),
          links: [
            { nid: ed.from, label: (notes.match.nodeToSavedRef[ed.from]) || s.nodeRefMap[ed.from] || 'B?' },
            { nid: ed.to, label: (notes.match.nodeToSavedRef[ed.to]) || s.nodeRefMap[ed.to] || 'B?' },
          ],
        }
      : null;
  }
  return out;
}

/**
 * Dựng lại toàn bộ node/edge phụ của notes (ô note mode full + card đang mở)
 * rồi ghi vào store. Gọi sau mỗi thay đổi notes/mode/card/layout.
 */
export function refreshNoteNodes(handlers) {
  const s = useStore.getState();
  const base = stripNoteNodes(s.rfNodes, s.rfEdges);
  if (!s.notes || !s.notes.match || s.notesMode === 'off') {
    useStore.setState({ rfNodes: base.nodes, rfEdges: base.edges });
    return;
  }
  const h = handlers || defaultCardHandlers;
  const panels = buildNotePanelNodes(s.notes, s.notesMode, base.nodes);
  let cardNodes = [], cardEdges = [];
  if (s.openNoteKey && s.openNoteAnchor) {
    const built = buildCardNodes(s.openNoteAnchor, s.openNoteKey, s.notes, base.nodes, {
      graphData: s.graphData, noteReserve: s.noteReserve, cardPos: s.cardPos,
    });
    cardNodes = built.nodes.map((n) => ({
      ...n,
      data: { ...n.data, ...cardViewData(s.openNoteAnchor, s.openNoteKey, s), ...h },
    }));
    cardEdges = built.edges;
  }
  // badge trên block: đưa state vào data của node CFG (CfgNode tự vẽ .nb)
  const nodeToRef = s.notes.match.nodeToSavedRef || {};
  const nodes = base.nodes.map((n) => {
    const nid = n.data && n.data.cfgNode ? n.data.cfgNode.id : null;
    const ref = nid == null ? null : nodeToRef[nid];
    const st = ref ? (s.notes.match.byRef[ref] || {}).state || 'orphan' : null;
    return {
      ...n,
      data: {
        ...n.data, notesMode: s.notesMode, noteState: st, noteRef: ref || null,
        noteOpen: !!ref && ref === s.openNoteKey,
      },
    };
  });
  // chấm state trên EDGE (port .edgeDot): refresh cũng phải cập nhật lại cho
  // edge — trước đây chỉ node được patch nên dot không bao giờ đúng sau đổi mode.
  const edgeIdxToRef = s.notes.match.edgeIdxToSavedRef || {};
  const edgeByRef = s.notes.match.edgeByRef || {};
  const edges = base.edges.map((e) => {
    const idx = e.data ? e.data.idx : null;
    const ref = idx == null ? null : edgeIdxToRef[idx];
    return {
      ...e,
      data: { ...e.data, noteState: ref ? (edgeByRef[ref] || {}).state || 'orphan' : null },
    };
  });
  useStore.setState({
    rfNodes: [...nodes, ...panels, ...cardNodes],
    rfEdges: [...edges, ...cardEdges],
  });
}

/* ------------------------------- card ----------------------------------- */

export function openNoteForNode(nid, handlers) {
  const s = useStore.getState();
  if (!s.notes || !s.notes.match) return null;
  const savedRef = s.notes.match.nodeToSavedRef[nid];
  if (!savedRef) return null; // block này không có note
  useStore.setState({ openNoteKey: savedRef, openNoteAnchor: { type: 'node', nid }, cardPos: null });
  refreshNoteNodes(handlers);
  return savedRef;
}

export function openNoteForEdge(idx, handlers) {
  const s = useStore.getState();
  if (!s.notes || !s.notes.match) return null;
  const savedRef = s.notes.match.edgeIdxToSavedRef[idx];
  if (!savedRef) return null;
  useStore.setState({ openNoteKey: savedRef, openNoteAnchor: { type: 'edge', idx }, cardPos: null });
  refreshNoteNodes(handlers);
  return savedRef;
}

export function closeNoteCard() {
  useStore.setState({ openNoteKey: null, openNoteAnchor: null, cardPos: null });
  refreshNoteNodes();
}

/** Chip B#/E# trong note → nhảy tới (port jumpToRef: B = centerNode,
 *  E = focus edge rồi mở card). */
export function jumpToRef(ref, { centerNode } = {}) {
  const s = useStore.getState();
  if (!s.notes || !s.notes.match) return null;
  if (ref[0] === 'B') {
    const v = s.notes.match.byRef[ref];
    if (v && v.nodeId != null) { centerNode && centerNode(v.nodeId); return { type: 'node', nid: v.nodeId }; }
  } else {
    const v = s.notes.match.edgeByRef[ref];
    if (v && v.idx != null) {
      focusEdgeByIdx(v.idx); // bản cũ tô sáng edge trước khi mở card
      openNoteForEdge(v.idx);
      return { type: 'edge', idx: v.idx };
    }
  }
  return null;
}

/** Tô focus 1 edge theo chỉ số CFG (port focusEdge tối giản của hover.js). */
export function focusEdgeByIdx(idx) {
  useStore.setState((s) => {
    const e = s.graphData && s.graphData.edges ? s.graphData.edges[idx] : null;
    const ends = e ? new Set(['n' + e.from, 'n' + e.to]) : new Set();
    return {
      rfEdges: s.rfEdges.map((x) => ({ ...x, data: { ...x.data, focus: x.data.idx === idx } })),
      rfNodes: s.rfNodes.map((n) => ({ ...n, data: { ...n.data, focus2: ends.has(n.id) } })),
    };
  });
}

/** 📖 hover câu trong ProsePanel → tô .pl các block/edge liên quan (port
 *  proseSentencePl). v2 trước chỉ ghi vào attribute data-pl của panel — không
 *  ai đọc — nên graph không hề sáng lên. */
export function applyProsePl(items, on) {
  const nodes = new Set(), edges = new Set();
  for (const it of items || []) {
    if (it.type === 'node') nodes.add('n' + it.nid);
    else if (it.type === 'edge') edges.add('e' + it.idx);
  }
  useStore.setState((s) => ({
    rfNodes: s.rfNodes.map((n) =>
      n.type !== 'cfg' ? n : { ...n, data: { ...n.data, pl: on && nodes.has(n.id) } }),
    rfEdges: s.rfEdges.map((e) =>
      e.type !== 'cfg' ? e : { ...e, data: { ...e.data, pl: on && edges.has(e.id) } }),
  }));
}
/** Gỡ mọi .pl do prose bật (port clearProsePl). */
export function clearProsePl() { applyProsePl([], false); }

/** ✎ sửa tay: lưu text mới, đánh dấu manual (port applyNoteText). */
export function applyNoteText(savedRef, text, orig) {
  const s = useStore.getState();
  const notes = s.notes;
  if (!notes) return null;
  const isEdge = savedRef[0] === 'E';
  const list = isEdge ? notes.edges || [] : notes.blocks || [];
  const it = list.find((x) => x.ref === savedRef);
  if (!it) { s.toast('Không tìm thấy note ' + savedRef); return null; }
  const t = String(text == null ? '' : text);
  if (!t.trim()) { s.toast('Note không được để trống — huỷ sửa'); return null; }
  if (t === String(orig == null ? '' : orig)) return it; // không đổi
  it.note = t;
  it.manual = true;
  syncEnvFromStore();
  saveNotes();
  pushEnvToStore();
  useStore.setState({ notes: { ...notes } });
  s.saveSrc();
  refreshNoteNodes();
  s.toast('Đã lưu note ' + savedRef + ' (✎ manual — re-import không ghi đè)');
  return it;
}

/* ----------------------------- main path -------------------------------- */

/** 🧭 bật/tắt luồng chính (port applyMainPath + clearMainPath). */
export function applyMainPath() {
  const s = useStore.getState();
  if (!s.notes || !s.graphData || !s.lastParsed) {
    s.toast('Cần Build graph + AI notes (📥) trước');
    return false;
  }
  if (s.mainPathOn) { clearMainPath(); return false; }
  if (s.hlKeys.size > 0) {
    s.toast('Bỏ tìm kiếm (Esc) trước — search và luồng chính cùng dùng highlight');
    return false;
  }
  const r = computeMainPath(s.notes, s.graphData);
  useStore.setState({
    mainPathOn: true, lit: r.lit, dimmed: r.dimmed,
    rfNodes: s.rfNodes.map((n) => ({ ...n, data: { ...n.data, lit: !!r.lit[n.id], dimmed: !!r.dimmed[n.id], mainPath: !!r.lit[n.id] } })),
    rfEdges: s.rfEdges.map((e) => ({ ...e, data: { ...e.data, lit: !!r.lit[e.id], dimmed: !!r.dimmed[e.id], mainPath: !!r.lit[e.id] } })),
  });
  s.toast('🧭 Luồng chính: ' + r.litN.size + ' block (' + r.source + ')');
  return true;
}

export function clearMainPath(silent) {
  const s = useStore.getState();
  if (!s.mainPathOn) return false;
  useStore.setState({
    mainPathOn: false, lit: {}, dimmed: {},
    rfNodes: s.rfNodes.map((n) => ({ ...n, data: { ...n.data, lit: false, dimmed: false, mainPath: false } })),
    rfEdges: s.rfEdges.map((e) => ({ ...e, data: { ...e.data, lit: false, dimmed: false, mainPath: false } })),
  });
  if (!silent) s.toast('Đã tắt luồng chính');
  return true;
}

/** Câu trong panel 📖 → block liên quan (hover .pl). */
export function refsOfSentence(notes, sentence) {
  const out = [];
  for (const ref of (sentence && sentence.refs) || []) {
    const v = ref[0] === 'B' ? notes.match.byRef[ref] : notes.match.edgeByRef[ref];
    if (!v) continue;
    if (ref[0] === 'B' && v.nodeId != null) out.push({ type: 'node', nid: v.nodeId, ref });
    else if (v.idx != null) out.push({ type: 'edge', idx: v.idx, ref });
  }
  return out;
}

void getAdjacency;
