/* =========================================================================
 * PCODE Grapher · src/ui/highlight.js — cầu nối search ⇄ store ⇄ React Flow
 * Giữ hành vi: highlight SỐNG QUA rebuild (đổi preset/theme/hướng) vì lit/dimmed
 * được tính lại từ graphData + hlKeys chứ không bám vào DOM.
 * ========================================================================= */

import { useStore } from '../store/useStore.js';
import { computeHighlights, stepIndex, clearReCache } from './search.js';
import { getAdjacency } from '../graph/build.js';

/** Áp lit/dimmed/hidden lên rfNodes/rfEdges đang có (không layout lại). */
export function applyHighlights() {
  const s = useStore.getState();
  const g = s.graphData;
  if (!g) return null;

  const positions = {};
  for (const n of s.rfNodes) {
    if (n.data && n.data.cfgNode) positions[n.data.cfgNode.id] = n.position;
  }

  // Text note theo node (đọc từ store nên luôn tươi — data.note trên rfNodes chỉ
  // cập nhật khi rebuild, còn applyNoteText chỉ gọi refreshNoteNodes).
  let noteTextById = null;
  const nm = s.notes && s.notes.match;
  if (s.notes && nm && nm.nodeToSavedRef) {
    const savedByRef = {};
    for (const b of s.notes.blocks || []) if (b && b.ref) savedByRef[b.ref] = b;
    noteTextById = {};
    for (const [nid, ref] of Object.entries(nm.nodeToSavedRef)) {
      const b = savedByRef[ref];
      if (b) noteTextById[nid] = ((b.note || '') + '\n' + (b.plain || '')).trim();
    }
  }

  const r = computeHighlights(g, s.hlKeys, {
    opts: s.opts,
    positions,
    adjacency: getAdjacency(),
    noteTextById,
  });

  // 🧭 Luồng chính và search DÙNG CHUNG .lit/.dimmed — có search thì tắt
  // lặng luồng chính (port applyHighlights cũ: `mainPathOn && size → clearMainPath(true)`).
  const dropMainPath = s.mainPathOn && s.hlKeys.size > 0;

  useStore.setState({
    lit: r.lit,
    dimmed: r.dimmed,
    hlOrder: r.order,
    hlIdx: -1,
    ...(dropMainPath ? { mainPathOn: false } : null),
    rfNodes: s.rfNodes.map((n) => {
      // B9: node phụ của notes (ô note 'np<id>', card 'nc') không có key
      // 'n<id>' → ẩn/hiện THEO block/edge mà nó bám, kẻo solo xong panel mồ côi.
      let hid = !!r.hidden[n.id];
      if (!hid && (n.type === 'notePanel' || n.type === 'noteCard') && n.data) {
        if (n.data.nid != null) hid = !!r.hidden['n' + n.data.nid];
        else if (n.data.idx != null) hid = !!r.hidden['e' + n.data.idx];
      }
      return {
        ...n,
        hidden: hid,
        data: {
          ...n.data,
          lit: !!r.lit[n.id],
          dimmed: !!r.dimmed[n.id],
          hit: !!r.hit[n.id],
          tokOn: r.tokOn,
          ...(dropMainPath ? { mainPath: false } : null),
        },
      };
    }),
    rfEdges: s.rfEdges.map((e) => ({
      ...e,
      hidden: !!r.hidden[e.id],
      data: {
        ...e.data,
        lit: !!r.lit[e.id],
        dimmed: !!r.dimmed[e.id],
        ...(dropMainPath ? { mainPath: false } : null),
      },
    })),
    ui: { ...s.ui, hlInfo: r.info, hlTotal: r.total },
  });
  return r;
}

/** Gõ ô tìm kiếm (1 key) — bản cũ: hlKeys.clear() + add. */
export function setSearchKey(value) {
  const v = String(value || '').trim();
  useStore.getState().setHlKeys(v ? [v] : []);
  return applyHighlights();
}

/** Click token trên block (Ctrl/Cmd = cộng dồn) — port highlightKey. */
export function toggleKey(key, additive) {
  useStore.getState().toggleHlKey(key, additive);
  return applyHighlights();
}

export function clearHighlight() {
  const s = useStore.getState();
  s.clearHighlight();
  useStore.setState({
    rfNodes: s.rfNodes.map((n) => ({
      ...n, hidden: false,
      data: { ...n.data, lit: false, dimmed: false, hit: false, tokOn: null },
    })),
    rfEdges: s.rfEdges.map((e) => ({ ...e, hidden: false, data: { ...e.data, lit: false, dimmed: false } })),
    ui: { ...s.ui, hlInfo: '', hlTotal: 0 },
  });
}

/** Đổi tuỳ chọn tìm kiếm (Aa / .* / \b / solo / dim) → xoá cache regex + tính lại. */
export function setSearchOption(key, value) {
  clearReCache();
  useStore.getState().setOpt(key, value);
  if (useStore.getState().hlKeys.size) applyHighlights();
}

/**
 * Nhảy kết quả trước/sau. Trả về { nid, idx, len, label } để UI center node.
 * Nhãn "1/9" hiển thị ở #hlInfo như bản cũ.
 */
export function stepHl(dir) {
  const s = useStore.getState();
  const len = s.hlOrder.length;
  if (!len) return null;
  const idx = stepIndex(s.hlIdx, dir, len);
  s.setHlIdx(idx);
  return { nid: s.hlOrder[idx], idx, len, label: idx + 1 + '/' + len };
}
