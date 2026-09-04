/* =========================================================================
 * PCODE Grapher · src/graph/constants.js
 * PORT NGUYÊN VĂN phần hằng số của js/ui/state.js (FILE-MAP §B):
 * EDGE_PALETTES (màu EXACT), PRESETS (số EXACT), COLLAPSE_AT/HEAD_L/TAIL_L,
 * collapsibleBlock, srcScopeOf (FNV-1a 32-bit).
 *
 * Ghi chú cấu trúc: FILE-MAP nói state.js → useStore.js + graph/layout.js.
 * Các hằng số này được CẢ store lẫn layout lẫn exporter dùng, nên tách ra file
 * riêng để không tạo vòng import (store ↔ layout). Nội dung không đổi.
 * ========================================================================= */

/* PALETTE edge v2 (color harmony): đỏ/xanh lá = TRUE/FALSE (giọng dự trữ duy
 * nhất); loop = SLATE + nét đứt + nhãn ↺ (vị phân biệt nhỠ texture, không cần
 * chiếm hue — trước đây loop === màu type #79c0ff khiến mũi tên lặp nhìn như
 * token kiểu); goto = taupe trung tính (trước: cam #d2a15a đụng gia đình
 * attn/search và goto light === warn #9a6700); plain/case = thang xám. */
export const EDGE_PALETTES = {
  dark: {
    true: { col: '#3ddc6a', label: 'T' },
    false: { col: '#e03e36', label: 'F' },
    loop: { col: '#4a6fa0', label: '↺' },
    goto: { col: '#8a7355', label: 'goto' },
    case: { col: '#7a8694', label: '' },
    plain: { col: '#5c6570', label: '' },
  },
  light: {
    true: { col: '#1a7f37', label: 'T' },
    false: { col: '#cf222e', label: 'F' },
    loop: { col: '#64748b', label: '↺' },
    goto: { col: '#8a7a5c', label: 'goto' },
    case: { col: '#656d76', label: '' },
    plain: { col: '#8c959f', label: '' },
  },
};

/** Bản cũ đọc class trên <html>; bản mới truyền theme từ store (D8: 1 nguồn sự thật). */
export function currentEdgePalette(theme) {
  if (theme === 'light' || theme === 'dark') return EDGE_PALETTES[theme];
  try {
    if (typeof document !== 'undefined' && document.documentElement.classList.contains('light')) {
      return EDGE_PALETTES.light;
    }
  } catch {
    /* node tests */
  }
  return EDGE_PALETTES.dark;
}

export const PRESETS = {
  compact: { nodesep: 22, ranksep: 40, edgesep: 8 },
  normal: { nodesep: 38, ranksep: 64, edgesep: 14 },
  wide: { nodesep: 56, ranksep: 92, edgesep: 22 },
};

/* FIX(35): hình học block — CSS (.node/.ln/.more) và layout.js dùng CHUNG bộ số
 * này, nhờ đó chiều cao suy được từ SỐ DÒNG thay vì phụ thuộc số đo DOM (font
 * nạp muộn / zoom chữ làm số đo sai ⇒ mũi tên lệch khỏi block). */
export const LN_H = 19;          // --ln-h: 1 dòng code
export const MORE_H = 25;        // dòng "▾ mở rộng / ▴ thu gọn" (22 + margin 3)
export const NODE_BORDER = 1;    // .node border 1px
export const NODE_PAD_Y = 8;     // .node padding dọc
export const LABEL_PAD_Y = 2;    // .node.k-label padding dọc

/** Chiều cao block tính từ SỐ DÒNG hiển thị — nguồn sự thật duy nhất. */
export function nodeHeightFromLines(n, expandedFlag) {
  const tot = (n.lines || []).length;
  const coll = collapsibleBlock(n);
  const shown = coll && !expandedFlag ? HEAD_L + TAIL_L : tot;
  const padY = n.kind === 'label' ? LABEL_PAD_Y : NODE_PAD_Y;
  return shown * LN_H + (coll ? MORE_H : 0) + padY * 2 + NODE_BORDER * 2;
}

export const COLLAPSE_AT = 24;
export const HEAD_L = 14;
export const TAIL_L = 3;

/* Block nào được phép gập khi quá dài.
 * Từ v1.9.3 dòng chữ ký nằm TRONG block đầu (không còn node entry riêng) nên block
 * đầu cũng có thể rất dài và phải gập được như block thường — nếu không, hàm nhiều
 * khai báo sẽ vẽ một ô khổng lồ và bản export không gập. Dòng chữ ký là dòng số 1
 * nên luôn nằm trong HEAD_L, bản gập vẫn hiển thị nó.
 * Graph và export phải dùng CÙNG điều kiện này, nếu không chữ tràn ra ngoài rect. */
export function collapsibleBlock(n) {
  return (
    !!n &&
    Array.isArray(n.lines) &&
    n.lines.length > COLLAPSE_AT &&
    (n.kind === 'block' || n.kind === 'entry' || !!(n.flags && n.flags.entry))
  );
}

/** FNV-1a 32-bit → base36. Nguyên văn state.js. */
export function srcScopeOf(text) {
  const s = String(text == null ? '' : text);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36);
}

/** Ngưỡng chuyển ELK → dagre (D3; benchmark lại ở T11). */
export const DAGRE_AT = 400;
/** Ngưỡng bật onlyRenderVisibleElements của React Flow — thống nhất với DAGRE_AT (T4). */
export const VIRTUALIZE_AT = 400;
/** Khoảng cách block ↔ card note (graph.js cũ: noteGapPx). */
export const NOTE_GAP_PX = 12;
/** Bề ngang ô note / card note (notes-card.js cũ: NOTE_PANEL_W). */
export const NOTE_PANEL_W = 292;
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;
