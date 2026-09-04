/* =========================================================================
 * PCODE Grapher · src/notes/richtext.js — tokenizer cho văn bản TỰ DO của
 * AI note / câu prose để tô màu token PARITY với block code.
 *
 * HAI NGUỒN SỰ THẬT, theo thứ tự ưu tiên:
 *
 *   1) DYNAMIC (chính) — buildColorCtx(graphData, liveNames): quét mọi token
 *      `id` trong graph HIỆN TẠI, classify bằng đúng classifyId() của block,
 *      map theo TÊN HIỂN THỊ (đã qua rename Ghidra) → ai đổi tên biến/hàm thì
 *      note tô đúng tên MỚI, và var nhận color = varColor(tên GỐC) — màu
 *      trùng tuyệt đối với block (block cũng tô theo tên gốc, chỉ đổi chữ).
 *      vd: FUN_140043820 đổi thành activationFailed → block class 'addr'
 *      (teal) → note cũng teal, KHÔNG bị ép 'fn' như heuristic tĩnh.
 *
 *   2) STATIC (fallback) — khi tên KHÔNG có trong graph (note nhắc biến đã
 *      xoá, note cũ, graph chưa build...): dùng tập kw/ty/addr/const của
 *      core/colors.js + pattern tên kiểu Ghidra.
 *
 * Văn bản prose KHÁC code: áp nguyên classifyId sẽ nhiễu loạn (mọi từ ASCII
 * đầu câu tiếng Việt "Sau", "Trong" thành type; từ thường "block" thành
 * biến). Vì vậy fallback static siết chặt:
 *   - 'ty': chỉ khi thuộc TYPE_WORDS hoặc nằm trong chuỗi C++ (liền trước/
 *     sau là ::) — CamelCase đứng lẻ KHÔNG tô.
 *   - 'const': UPPER_CASE cần ≥3 ký tự thật ("RA" trong prose KHÔNG tô).
 *   - 'fn': chỉ khi '(' SÁT KỀ ("ghi (x)" trong văn không phải gọi hàm).
 *   - 'var': CHỈ tên kiểu Ghidra (local_XX, param_N, uVar1, pQVar9, in_*…) —
 *     từ ASCII bình thường để trơn.
 *   - ref chip B#/E# bắt TRƯỚC identifier ("B13" là chip, không phải const).
 * Bảo đảm round-trip: nối toàn bộ segment trả về === input nguyên văn.
 *
 * Export: richSegments(text, ctx?) → [{t:'txt',s} | {t:'ref',s} |
 *          {t:'sp', s, cls:'rt-*'} | {t:'sp', s, color:'#hex' (var)}]
 *         buildColorCtx(graphData, liveNames) → {vars, clsOf}
 *         colorCtxForGraph(graphData, liveNames) — như trên + WeakMap cache
 * ========================================================================= */

import {
  KEYWORDS, isTypeWord, isAddrWord, isConstWord, isGhidraOp,
  varColor, classifyId,
} from '../core/colors.js';

/** Tên biến kiểu Ghidra — fallback static khi tên không có trong graph. */
const VAR_RE =
  /^(local_[0-9A-Za-z_]+|param_[0-9]+|unaff_[0-9A-Za-z_]+|extraout_[0-9A-Za-z_]+|in_[0-9A-Za-z_]*|[A-Za-z]{0,6}Var\d+)$/;

/* Nhóm 1: ref chip B#/E# · 2: chuỗi có nháy · 3: số (hex/dec) · 4: identifier
 * · 5: ::/->/~ — mọi ký tự còn lại (kể cả ( ) & * = ; , …) giữ nguyên trong
 * đoạn 'txt', chỉ cần nhìn raw char sát kề identifier để xét ngữ cảnh. */
const TOK =
  /(\b[BE]\d+\b)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|(0[xX][0-9a-fA-F]+|\d[\d_]*)|([A-Za-z_][A-Za-z0-9_]*)|(::|->|~)/g;

const EMPTY_CTX = { vars: new Map(), clsOf: new Map() };

/**
 * Quét token của graph → bảng tra theo TÊN HIỂN THỊ (post-rename):
 *   vars : dispName → origName   (biến; tô color=varColor(origName) = parity)
 *   clsOf: dispName → 'rt-fn'/'rt-addr'/… (non-var; class Y HỆT block đang
 *           dùng cho token đó — kể cả sau khi rename hàm/kiểu).
 * Tên đổi trùng nhau thì lần gặp đầu thắng (hiếm, chấp nhận).
 */
export function buildColorCtx(graphData, liveNames) {
  const vars = new Map();
  const clsOf = new Map();
  for (const n of (graphData && graphData.nodes) || []) {
    for (const ln of n.lines || []) {
      const toks = ln.toks;
      if (!toks) continue;
      for (let i = 0; i < toks.length; i++) {
        if (toks[i].t !== 'id') continue;
        const orig = toks[i].v;
        const disp = (liveNames && typeof liveNames.get === 'function' && liveNames.get(orig)) || orig;
        if (vars.has(disp) || clsOf.has(disp)) continue;
        const c = classifyId(toks, i);
        if (c === 'var') vars.set(disp, orig);
        else clsOf.set(disp, 'rt-' + c);
      }
    }
  }
  return { vars, clsOf };
}

/* Cache 2 tầng theo REFERENCE: store luôn tạo graphData/liveNames MỚI khi
 * đổi → WeakMap(graphData → liveNames → ctx) hit O(1) cho mọi câu note trong
 * cùng một graph, chỉ build lại khi graph/rename thật sự thay đổi. */
const _ctxCache = new WeakMap();

export function colorCtxForGraph(graphData, liveNames) {
  if (!graphData) return EMPTY_CTX;
  // không phải Map (session cũ restore object trần) → tính thẳng, không cache
  if (!liveNames || typeof liveNames.get !== 'function') return buildColorCtx(graphData, null);
  let m = _ctxCache.get(graphData);
  if (!m) { m = new WeakMap(); _ctxCache.set(graphData, m); }
  let ctx = m.get(liveNames);
  if (!ctx) { ctx = buildColorCtx(graphData, liveNames); m.set(liveNames, ctx); }
  return ctx;
}

/**
 * classifyId() phiên bản siết cho prose — thứ tự giống hệt classifyId của
 * core (gop → ty → addr → fn-theo-'(' → const → kw), trừ nhánh CamelCase→ty
 * được đổi thành "đứng trong chuỗi ::" để chống nhiễu.
 */
function classifyNoteWord(w, afterParen, inChain) {
  if (isGhidraOp(w)) return 'rt-gop';     // CONCAT44/SUB41 — parity block
  if (isTypeWord(w)) return 'rt-ty';      // int/uint32_t/QString/DWORD…
  if (isAddrWord(w)) return 'rt-addr';    // FUN_/DAT_/PTR_/LAB_… — block cũng tô addr kể cả khi gọi
  if (afterParen) return 'rt-fn';         // warning( — '(' sát kề
  if (inChain) return 'rt-ty';            // QMessageLogger::warning — vế trong chuỗi ::
  if (isConstWord(w) && w.replace(/^_+|_+$/g, '').length >= 3) return 'rt-const';
  if (KEYWORDS.has(w)) return 'rt-kw';    // if/return/while… AI hay chép code vào note
  return null;
}

/**
 * Tách note text thành segment có màu. Pure — không đụng DOM/store,
 * varColor() tự nhận theme (dark/light) giống hệt khi render block.
 * @param ctx — {vars, clsOf} từ buildColorCtx/colorCtxForGraph (tuỳ chọn).
 */
export function richSegments(text, ctx = null) {
  const s = String(text == null ? '' : text);
  const segs = [];
  let last = 0, m;
  const pushTxt = (t) => {
    if (!t) return;
    const L = segs[segs.length - 1];
    if (L && L.t === 'txt') L.s += t;
    else segs.push({ t: 'txt', s: t });
  };
  TOK.lastIndex = 0;
  while ((m = TOK.exec(s))) {
    pushTxt(s.slice(last, m.index));
    const [full, ref, str, num, id] = m;
    last = m.index + full.length;
    if (ref) { segs.push({ t: 'ref', s: ref }); continue; }
    if (str) { segs.push({ t: 'sp', s: str, cls: 'rt-str' }); continue; }
    if (num) { segs.push({ t: 'sp', s: num, cls: 'rt-num' }); continue; }
    if (id) {
      // (1) DYNAMIC — tên (đã rename) có trong graph hiện tại → parity tuyệt đối
      if (ctx) {
        const orig = ctx.vars.get(id);
        if (orig != null) { segs.push({ t: 'sp', s: id, color: varColor(orig) }); continue; }
        const dc = ctx.clsOf.get(id);
        if (dc) { segs.push({ t: 'sp', s: id, cls: dc }); continue; }
      }
      // (2) STATIC fallback — tên không có trong graph
      const after = last < s.length ? s[last] : '';
      const before = m.index > 0 ? s[m.index - 1] : '';
      const cls = classifyNoteWord(id, after === '(', after === ':' || before === ':' || before === '~');
      if (cls) segs.push({ t: 'sp', s: id, cls });
      else if (VAR_RE.test(id)) segs.push({ t: 'sp', s: id, color: varColor(id) });
      else pushTxt(id);
      continue;
    }
    pushTxt(full); // ::/->/~ giữ nguyên trơn — chỉ làm neo ngữ cảnh
  }
  pushTxt(s.slice(last));
  return segs;
}
