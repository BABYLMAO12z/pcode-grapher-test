/* =========================================================================
 * PCODE Grapher · src/ui/search.js — highlight token giống IDA + dim + solo
 * PORT js/ui/search.js: giữ nguyên _reCache/_matcherFor/matchKey/applyHighlights/
 * stepHl. Khác bản cũ: KHÔNG đụng DOM — trả về map lit/dimmed để store phát cho
 * CfgNode/CfgEdge (SPEC §3), thứ tự kết quả tính từ toạ độ layout thay vì style.
 * ========================================================================= */

import { lineText } from './tokens.js';

/* Regex compile 1 lần / key / tuỳ chọn (bản cũ: mỗi token một new RegExp → đơ
 * với hàm lớn). Cache có trần để không phình. */
const _reCache = new Map();

export function clearReCache() {
  _reCache.clear();
}

export function _matcherFor(k, mode, caseOn) {
  const id = mode + '|' + (caseOn ? 'c' : 'i') + '|' + k;
  if (_reCache.has(id)) return _reCache.get(id);
  let re = null;
  try {
    re =
      mode === 'regex'
        ? new RegExp(k, caseOn ? '' : 'i')
        : new RegExp('\\b' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', caseOn ? '' : 'i');
  } catch {
    re = null; // regex sai cú pháp → coi như không khớp (giữ hành vi cũ)
  }
  if (_reCache.size > 400) _reCache.clear();
  _reCache.set(id, re);
  return re;
}

/** @param {{searchCase,searchRegex,searchWord}} opts */
export function matchKey(text, key, opts = {}) {
  const caseOn = !!opts.searchCase;
  const regexOn = !!opts.searchRegex;
  const wordOn = !!opts.searchWord;
  if (!key || key.length > 200 || !text) return false;
  if (regexOn || wordOn) {
    // FIX(3): KHÔNG hạ chữ pattern — với regex thì `\W→\w`, `\D→\d`, `\S→\s`,
    // `\B→\b`, `\P{..}→\p{..}` đảo ngược hoàn toàn ý nghĩa. Phân biệt hoa/thường
    // đã do cờ 'i' của RegExp lo (xem _matcherFor), text cũng giữ nguyên.
    // Chỉ cắt 5000 ký tự Ở CHẾ ĐỘ REGEX (chống catastrophic backtracking).
    const re = _matcherFor(key, regexOn ? 'regex' : 'word', caseOn);
    return re ? re.test(String(text).slice(0, 5000)) : false;
  }
  // substring thuần: tuyến tính, an toàn → quét TOÀN BỘ text (trước đây cắt
  // 5000 ký tự nên fallback full-text bỏ sót cuối block dài, im lặng).
  const t = caseOn ? text : text.toLowerCase();
  const k = caseOn ? key : key.toLowerCase();
  return t.includes(k);
}

/** Mọi data-key (identifier) của một block — tương đương .tk[data-key] trong DOM cũ. */
export function nodeKeysOf(cfgNode) {
  const out = new Set();
  for (const L of cfgNode.lines || []) {
    for (const tk of L.toks || []) if (tk.t === 'id') out.add(tk.v);
  }
  return out;
}

export function nodePlainOf(cfgNode) {
  return (cfgNode.lines || []).map(lineText).join('\n');
}

/**
 * Tính highlight (thay applyHighlights + clearHlMarks của bản cũ).
 * @returns {{lit, dimmed, hidden, hit, order, total, fallback, info, tokOn}}
 *   lit/dimmed/hidden/hit khoá theo id React Flow ('n<id>' / 'e<idx>');
 *   hit = node khớp nhờ fallback full-text (bản cũ: .hit → viền cam),
 *   tokOn = Set text token khớp (bản cũ: .tk.on).
 */
export function computeHighlights(graphData, hlKeys, ctx = {}) {
  const { opts = {}, positions = {}, adjacency = {} } = ctx;
  const keys = [...(hlKeys || [])];
  const empty = { lit: {}, dimmed: {}, hidden: {}, hit: {}, order: [], total: 0, fallback: false, info: '', tokOn: new Set() };
  if (!graphData || !keys.length) return empty;

  const solo = !!opts.searchSolo;
  const litNodes = new Set();
  let tokenHits = 0;
  // Tập TEXT token (identifier) khớp → CfgNode gắn .tk.on, tô riêng token
  // khớp bên trong block (port `e.classList.add('on')` của applyHighlights cũ).
  const tokOn = new Set();

  for (const n of graphData.nodes || []) {
    let hit = false;
    for (const key of nodeKeysOf(n)) {
      if (keys.some((k) => matchKey(key, k, opts))) {
        tokenHits++;
        hit = true;
        tokOn.add(key);
      }
    }
    if (hit) litNodes.add(n.id);
  }

  // full-text fallback: 1 key, không khớp token nào → tìm trong text block
  let fallback = false;
  const single = keys.length === 1 ? keys[0] : null;
  if (single && !litNodes.size && single.length >= 1) {
    fallback = true;
    for (const n of graphData.nodes || []) {
      if (matchKey(nodePlainOf(n), single, opts)) litNodes.add(n.id);
    }
  }

  const lit = {};
  const dimmed = {};
  const hidden = {};
  const hit = {}; // node chỉ khớp nhờ full-text fallback → viền cam (.hit) như bản cũ
  for (const id of litNodes) lit['n' + id] = true;
  if (fallback) for (const id of litNodes) hit['n' + id] = true;

  // edge chạm node lit cũng sáng ("đường nối" không bị mờ)
  const litEdges = new Set();
  for (const id of litNodes) {
    const a = adjacency[id];
    if (a) for (const i of a.edges) litEdges.add(i);
  }
  for (const i of litEdges) lit['e' + i] = true;

  // FIX(9): `total` phải CÙNG ĐƠN VỊ với `order` (số BLOCK sáng) vì ◀/▶ nhảy
  // theo order.length. Trước đây total = tokenHits (số lần token xuất hiện)
  // nên "3/17 kết quả" trong khi chỉ có 4 block để nhảy. Số lần khớp token vẫn
  // được báo riêng trong info.
  const total = litNodes.size;
  const shouldDim = !!opts.dim && total && !solo;

  if (total && (shouldDim || solo)) {
    for (const n of graphData.nodes || []) {
      if (!litNodes.has(n.id)) {
        dimmed['n' + n.id] = true;
        if (solo) hidden['n' + n.id] = true;
      }
    }
    (graphData.edges || []).forEach((e, i) => {
      const both = litNodes.has(e.from) && litNodes.has(e.to);
      if (!litEdges.has(i)) dimmed['e' + i] = true;
      if (solo && !both) hidden['e' + i] = true;
    });
  }

  // thứ tự đọc trên graph: trên→dưới, trái→phải (không theo node id)
  const order = [...litNodes].sort((a, b) => {
    const pa = positions[a], pb = positions[b];
    if (!pa || !pb) return a - b;
    return pa.y !== pb.y ? pa.y - pb.y : pa.x - pb.x;
  });

  const optNames = [];
  if (opts.searchCase) optNames.push('Aa');
  if (opts.searchRegex) optNames.push('.*');
  if (opts.searchWord) optNames.push('\\b');
  if (solo) optNames.push('solo');

  const info =
    '🔍 ' + keys.join(', ') + (fallback ? ' (khớp văn bản)' : '') +
    ' · ' + total + ' block' +
    (tokenHits && !fallback ? ' / ' + tokenHits + ' lượt khớp' : '') +
    (optNames.length ? ' · ' + optNames.join('/') : '') +
    ' · Ctrl+click thêm · Esc bỏ';

  return { lit, dimmed, hidden, hit, order, total, fallback, info, tokOn };
}

/** Vị trí kế tiếp/trước trong danh sách kết quả (port stepHl, chỉ tính chỉ số). */
export function stepIndex(idx, dir, len) {
  if (!len) return -1;
  return (idx + dir + len) % len;
}
