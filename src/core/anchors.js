import { KEYWORDS, isGhidraOp } from './colors.js';

/* =========================================================================
 * PCODE Grapher · js/core/anchors.js — anchor block + khớp note ↔ block (thuần, không DOM)
 *
 * "Anchor" của một block CFG = vân tay NHẬN DIỆN ĐƯỢC SAU KHI RENAME:
 *   - skeleton: thay identifier (ngoài keyword/Ghidra-op) bằng V1..Vn theo
 *     thứ tự xuất hiện; giữ nguyên toán tử/số/chuỗi, bỏ comment
 *     → đổi tên biến KHÔNG thay đổi skeleton.
 *   - lines: phạm vi dòng source [l0, l1] (tk.ln) → trôi khi chèn code phía trên.
 *   - ids: danh sách identifier "có ý nghĩa" (loại keyword/ghidra-op) → Jaccard.
 *
 * matchBlocks(savedBlocks, anchors) gắn note đã lưu vào CFG hiện tại:
 *   - skHash TRÙNG            → state 'ok'    (code không đổi, rename thoải mái)
 *   - composite = 0.55*lines + 0.45*jaccard ≥ 0.6 → state 'stale' (code đã sửa)
 *   - không ứng viên đạt      → state 'orphan' (không tìm thấy block)
 *   Mỗi block chỉ nhận MỘT note (greedy theo score giảm dần).
 *
 * Cần: js/core/colors.js (KEYWORDS, isGhidraOp, PcodeCore). Load SAU colors.js.
 * ========================================================================= */


const ANCHOR_KEYWORDS = KEYWORDS;
const ANCHOR_GOP = isGhidraOp;
const MATCH_MIN = 0.6;

// FNV-1a 32-bit → hex 8 ký tự. Ổn định mọi nền tảng/build (cùng họ với varColor).
function fnv1a(str) {
  let h = 0x811c9dc5 >>> 0;
  const s = String(str == null ? '' : str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// Token list → chuỗi skeleton (vân tay bất biến với rename).
// Keyword (if/while/…) và Ghidra-op (CONCAT41, SUB41…) GIỮ NGUYÊN vì chúng
// mang thông tin cấu trúc; chỉ biến/tên hàm bị thay bằng Vn.
function skeletonOf(toks) {
  const ids = new Map();
  let n = 0;
  const parts = [];
  for (const tk of toks || []) {
    if (!tk) continue;
    if (tk.t === 'com') continue;
    if (tk.t === 'id') {
      if (ANCHOR_KEYWORDS.has(tk.v) || ANCHOR_GOP(tk.v)) { parts.push(tk.v); continue; }
      if (!ids.has(tk.v)) ids.set(tk.v, 'V' + (++n));
      parts.push(ids.get(tk.v));
    } else {
      parts.push(tk.v);
    }
  }
  return parts.join(' ');
}

// node CFG → anchor {lines, skeleton, skHash, ids}
function nodeAnchors(node) {
  const all = [];
  let l0 = 0, l1 = 0;
  const ids = [];
  const seen = new Set();
  const bump = (ln) => { if (ln) { if (!l0) l0 = ln; if (ln > l1) l1 = ln; } };
  for (const L of (node && node.lines) || []) {
    if (L.toks) {
      for (const tk of L.toks) {
        all.push(tk);
        bump(tk.ln);
        if (tk.t === 'id' && !ANCHOR_KEYWORDS.has(tk.v) && !ANCHOR_GOP(tk.v) && !seen.has(tk.v)) {
          seen.add(tk.v);
          ids.push(tk.v);
        }
      }
    }
    bump(L.ln); // dòng tổng hợp (label / comment — parser giữ ln từ 1.9.0)
  }
  const sk = skeletonOf(all);
  return { lines: l0 ? [l0, l1] : null, skeleton: sk, skHash: fnv1a(sk), ids };
}

// CFG → danh sách anchor. ref 'B01','B02'… = thứ tự trong danh sách node CUỐI
// (sau collapse — node.id có thể có khoảng trống vì collapse xoá block rỗng,
// KHÔNG dùng node.id để đánh ref vì ref là hợp đồng với AI: phải liên tiếp,
// đọc được). nodeId giữ đúng id thật để tra node.
function buildAnchors(graphData) {
  const out = [];
  const nodes = ((graphData && graphData.nodes) || []);
  nodes.forEach((n, i) => {
    const a = nodeAnchors(n);
    out.push({
      ref: 'B' + (i + 1), nodeId: n.id, kind: n.kind || '',
      lines: a.lines, skeleton: a.skeleton, skHash: a.skHash, ids: a.ids
    });
  });
  return out;
}

// CFG → danh sách anchor edge. ref 'E1','E2'… = edge index 0,1… (không padding,
// khớp định dạng ref block). idx giữ index trong graphData.edges.
function buildEdgeAnchors(graphData) {
  return ((graphData && graphData.edges) || []).map((e, i) => ({
    ref: 'E' + (i + 1), idx: i, from: e.from, to: e.to,
    kind: e.kind || 'plain', elabel: e.elabel || ''
  }));
}

function jaccard(a, b) {
  const A = new Set(a || []), B = new Set(b || []);
  if (!A.size && !B.size) return 1;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const uni = A.size + B.size - inter;
  return uni ? inter / uni : 0;
}

/* Tỷ lệ overlap phạm vi dòng (0..1) — FIX(26): chia cho HỢP (kiểu Jaccard) thay
 * vì cho vùng NGẮN hơn. Cách cũ cho block 1 dòng nằm lọt trong block 50 dòng
 * điểm TUYỆT ĐỐI 1.0, khiến matchBlocks gắn note của cả khối lớn vào một dòng lẻ. */
function linesScore(a, b) {
  if (!a || !b) return 0;
  const lo = Math.max(a[0], b[0]), hi = Math.min(a[1], b[1]);
  if (hi < lo) return 0;
  const inter = hi - lo + 1;
  const union = Math.max(a[1], b[1]) - Math.min(a[0], b[0]) + 1;
  return union > 0 ? inter / union : 0;
}

// savedBlocks: [{ref, kind, lines, skeleton, skHash, ids|tokens}] (từ JSON AI)
// anchors:      buildAnchors()
// → { byRef: { ref: {nodeId, anchorRef, score, state: 'ok'|'stale'|'orphan'} } }
//
// 3 PASS để KHÔNG bị O(n²) với graph lớn (đo: 3000 block):
//   Pass 1 — EXACT: index anchor theo skHash (Map). Code không đổi/rename
//     (trường hợp thường gặp) → O(n) tổng, không cần quét cặp.
//     Với nhiều anchor cùng hash (block "đồng cấu", vd cả hai chỉ có 1 lệnh),
//     chọn cái CHIA SẺ nhiều tên thật nhất: 1 + 0.001*jaccard(ids) — tránh
//     nhầm note "gọi a()" sang block "gọi b()".
//   Pass 1b — DEGENERATE: anchor skeleton RỖNG (node label). Không có vân
//     tay → khớp theo kind + lines (trước), rồi theo vị trí.
//   Pass 2 — COMPOSITE: chỉ chạy cho saved block CHƯA khớp pass 1/1b (code đã sửa).
//     Short-circuit: linesScore === 0 ⇒ composite tối đa 0.45 < MATCH_MIN
//     ⇒ bỏ qua cặp đó, KHÔNG tốn jaccard (đa số cặp không overlap dòng).
function matchBlocks(savedBlocks, anchors) {
  const byRef = {};
  const claimed = new Set();
  const list = anchors || [];

  // index skHash → [anchor] (bỏ block skeleton rỗng — không anchor được)
  const byHash = new Map();
  for (const a of list) {
    if (a.skeleton === '') continue;
    const arr = byHash.get(a.skHash);
    if (arr) arr.push(a); else byHash.set(a.skHash, [a]);
  }

  // Pass 1 — exact (skHash trùng)
  for (const sb of savedBlocks || []) {
    if (!sb || !sb.skHash) continue;
    const pool = byHash.get(sb.skHash);
    if (!pool || !pool.length) continue;
    let best = null;
    if (pool.length <= 32) {
      // pool nhỏ: phân định bằng jaccard tên thật (vd "gọi a()" vs "gọi b()")
      const sbIds = sb.ids || sb.tokens || [];
      for (const a of pool) {
        if (claimed.has(a.nodeId)) continue;
        const score = 1 + 0.001 * jaccard(sbIds, a.ids) + ((sb.kind && sb.kind === a.kind) ? 0.01 : 0);
        if (!best || score > best.score) best = { anchor: a, score };
      }
    } else {
      // pool LỚN (hàng trăm block đồng cấu, vd loop unrolled): gán theo vị trí
      // đầu tiên còn trống — code như nhau nên note nào cũng đúng vị trí đó,
      // và cách này giữ pass 1 ở O(n) chứ không O(n·k).
      for (const a of pool) {
        if (!claimed.has(a.nodeId)) { best = { anchor: a, score: 1 }; break; }
      }
    }
    if (best) {
      claimed.add(best.anchor.nodeId);
      byRef[sb.ref] = {
        nodeId: best.anchor.nodeId, anchorRef: best.anchor.ref,
        score: +best.score.toFixed(3), state: 'ok'
      };
    }
  }

  // Pass 1b — anchor "lỗi thời" (skeleton RỖNG: node label — dòng label
  // không có toks nên không có vân tay). Mọi skeleton rỗng cùng một hash
  // nên KHÔNG thể khớp bằng skHash → khớp theo kind + lines (trước), nếu
  // lines trôi (chèn dòng phía trên) → theo vị trí (label hiếm, note trên
  // label ít khi quan trọng — vẫn tốt hơn là orphan).
  const EMPTY_SK_HASH = fnv1a('');
  for (const sb of savedBlocks || []) {
    if (!sb || byRef[sb.ref]) continue;
    if (sb.skeleton !== '' && sb.skHash !== EMPTY_SK_HASH) continue;
    const pool = [];
    for (const a of list) {
      if (claimed.has(a.nodeId) || a.skeleton !== '') continue;
      if (sb.kind && a.kind && sb.kind !== a.kind) continue;
      pool.push(a);
    }
    let pick = null;
    if (sb.lines) {
      for (const a of pool) {
        if (a.lines && a.lines[0] === sb.lines[0] && a.lines[1] === sb.lines[1]) { pick = a; break; }
      }
    }
    if (!pick) pick = pool[0] || null;
    if (pick) {
      claimed.add(pick.nodeId);
      byRef[sb.ref] = { nodeId: pick.nodeId, anchorRef: pick.ref, score: 1, state: 'ok' };
    }
  }

  // Pass 2 — composite cho phần chưa khớp
  for (const sb of savedBlocks || []) {
    if (byRef[sb.ref]) continue;
    const hasSk = !!(sb.skHash || sb.skeleton);
    if (!hasSk) continue;
    const sbIds = sb.ids || sb.tokens || [];
    let best = null;
    for (const a of list) {
      if (a.skeleton === '' || claimed.has(a.nodeId)) continue;
      const ls = linesScore(sb.lines, a.lines);
      if (ls === 0) continue; // không overlap dòng ⇒ không thể đạt MATCH_MIN
      const score = 0.55 * ls + 0.45 * jaccard(sbIds, a.ids) + ((sb.kind && sb.kind === a.kind) ? 0.01 : 0);
      if (score >= MATCH_MIN && (!best || score > best.score)) best = { anchor: a, score };
    }
    if (best) {
      claimed.add(best.anchor.nodeId);
      byRef[sb.ref] = {
        nodeId: best.anchor.nodeId, anchorRef: best.anchor.ref,
        score: +best.score.toFixed(3), state: 'stale'
      };
    }
  }

  for (const sb of savedBlocks || []) {
    if (!byRef[sb.ref]) byRef[sb.ref] = { nodeId: null, anchorRef: null, score: 0, state: 'orphan' };
  }
  return { byRef };
}

// savedEdges: [{ref, from:'Bxx', to:'Bxx', kind, label}]
// refMap:     { 'Bxx': nodeId } (dựng từ byRef của matchBlocks)
// edgeAnchors: buildEdgeAnchors()
// → { byRef: { ref: {idx, state: 'ok'|'stale'|'orphan'} } }
function matchEdges(savedEdges, refMap, edgeAnchors) {
  const byRef = {};
  const claimed = new Set();
  for (const se of savedEdges || []) {
    const f = refMap ? refMap[se.from] : null;
    const t = refMap ? refMap[se.to] : null;
    if (f == null || t == null) { byRef[se.ref] = { idx: null, state: 'orphan' }; continue; }
    const pool = (edgeAnchors || []).filter(a => !claimed.has(a.idx) && a.from === f && a.to === t);
    let pick = null;
    if (se.kind) pick = pool.find(a => a.kind === se.kind) || null;
    if (!pick) pick = pool[0] || null;
    if (!pick) { byRef[se.ref] = { idx: null, state: 'orphan' }; continue; }
    claimed.add(pick.idx);
    /* FIX(11): kind/label RỖNG trong bản lưu = "không biết", không phải "khác".
     * Bản cũ so sánh thẳng nên edge lưu từ phiên bản trước (chưa có kind) luôn
     * bị đánh 'stale' dù topology khớp hoàn hảo → note edge hiện cảnh báo oan. */
    const kindOk = !se.kind || pick.kind === se.kind;
    const labelOk = !se.label || (pick.elabel || '') === se.label;
    byRef[se.ref] = { idx: pick.idx, state: (kindOk && labelOk) ? 'ok' : 'stale' };
  }
  return { byRef };
}

export {
  MATCH_MIN, fnv1a, skeletonOf, nodeAnchors, buildAnchors, buildEdgeAnchors,
  jaccard, linesScore, matchBlocks, matchEdges
};
