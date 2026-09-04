/* =========================================================================
 * PCODE Grapher · src/notes/anchors.js
 * PORT NGUYÊN VĂN js/ui/notes-anchor.js (358 dòng) — anchor matching +
 * rename-proof 2 chiều (graph ⇄ notes).
 *
 * Khác bản cũ DUY NHẤT ở chỗ lấy dữ liệu: global → getEnv() (xem env.js).
 * KHÔNG đổi thuật toán, hằng số, thứ tự xử lý hay chuỗi thông báo.
 * ========================================================================= */

import * as PcodeCore from '../core/index.js';
import { getEnv } from './env.js';

// --- const REF_OFFSETS ---
export const REF_OFFSETS = [-2, -1, 0, 1, 2];

// --- const NOTE_STOP ---
export const NOTE_STOP = new Set(
  ('block note edge true false null return void int char long short float double ' +
    'unsigned signed const static else then while for switch case break goto label this and or not ' +
    'của và hoặc là trong ngoài khi nếu thì để bị được gọi hàm biến khối nhánh điều kiện chuyển tới ' +
    'sang kiểm tra khởi tạo giá trị kết thúc trả về xử lý đọc ghi gán vòng lặp điểm thân mã').split(/\s+/)
);

// --- function liveRenameMap ---
export function liveRenameMap() {
  const m = new Map();
  try {
    const GHDR = getEnv().GHDR;
    if (GHDR && GHDR.connected && GHDR.symByText) {
      for (const text in GHDR.symByText) {
        const info = GHDR.symByText[text];
        if (info && info.name && info.source !== 'DEFAULT' && info.name !== text) m.set(text, info.name);
      }
    }
  } catch { /* bridge state hỏng → coi như offline */ }
  return m;
}

// --- function liveNameOf ---
// Tên live của một identifier (bridge Ghidra), hoặc chính nó khi offline.
export function liveNameOf(name) {
  const m = liveRenameMap();
  return m.get(name) || name;
}

// --- function makeRenameRe ---
export function makeRenameRe(map) {
  if (!map || !map.size) return null;
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const alts = [...map.keys()]
    .filter((k) => typeof k === 'string' && k.length && /^[A-Za-z_][A-Za-z0-9_]*$/.test(k))
    .sort((a, b) => b.length - a.length)
    .map(escRe);
  if (!alts.length) return null;
  try {
    return new RegExp('\\b(' + alts.join('|') + ')\\b', 'g');
  } catch {
    return null; // map quá lớn / ký tự lạ → bỏ qua, không phá note
  }
}

// --- function applyRenameMap ---
export function applyRenameMap(text, map) {
  if (!text || !map || !map.size) return text;
  const re = makeRenameRe(map);
  if (!re) return text;
  return String(text).replace(re, (hit) => map.get(hit) || hit);
}

// --- function collectRenameMap ---
export function collectRenameMap(anchors, mb) {
  const map = new Map();
  const notes = getEnv().notes;
  if (!notes) return map;
  const savedByRef = {};
  (notes.blocks || []).forEach((b) => { if (b && b.ref) savedByRef[b.ref] = b; });
  const anchorByNodeId = {};
  (anchors || []).forEach((a) => { anchorByNodeId[a.nodeId] = a; });
  for (const ref in (mb && mb.byRef) || {}) {
    const match = mb.byRef[ref];
    if (!match || match.state !== 'ok' || match.nodeId == null) continue;
    const saved = savedByRef[ref];
    const cur = anchorByNodeId[match.nodeId];
    if (!saved || !cur) continue;
    const savedTokens = Array.isArray(saved.originalTokens) ? saved.originalTokens : [];
    const curIds = Array.isArray(cur.ids) ? cur.ids : [];
    if (!savedTokens.length || savedTokens.length !== curIds.length) continue; // cấu trúc đổi → bỏ
    for (let i = 0; i < savedTokens.length; i++) {
      if (savedTokens[i] !== curIds[i]) map.set(savedTokens[i], curIds[i]);
    }
    // baseline mới: lần rename KẾ TIẾP so với trạng thái vừa đồng bộ
    saved.originalTokens = curIds.slice();
  }
  liveRenameMap().forEach((nv, k) => map.set(k, nv)); // live thắng diff source
  return map;
}

// --- function applyRenamesToNotes ---
export function applyRenamesToNotes(map) {
  const notes = getEnv().notes;
  if (!notes || !map || !map.size) return 0;
  let changed = 0;
  (notes.blocks || []).forEach((b) => {
    if (!b) return;
    const nn = applyRenameMap(b.note, map);
    if (nn !== b.note) { b.note = nn; changed++; }
    if (b.plain) { const np = applyRenameMap(b.plain, map); if (np !== b.plain) b.plain = np; }
  });
  (notes.edges || []).forEach((e) => {
    if (!e || !e.note) return;
    const nn = applyRenameMap(e.note, map);
    if (nn !== e.note) { e.note = nn; changed++; }
  });
  if (notes.summary) {
    const sm = notes.summary;
    if (sm.sentences) sm.sentences.forEach((s) => { if (s && s.text) s.text = applyRenameMap(s.text, map); });
    if (sm.sideEffects) sm.sideEffects = sm.sideEffects.map((t) => applyRenameMap(t, map));
    if (sm.unknowns) sm.unknowns = sm.unknowns.map((t) => applyRenameMap(t, map));
  }
  return changed;
}

// --- function displayCodeOf ---
export function displayCodeOf(nid) {
  const nodePlain = getEnv().nodePlain;
  const src = nodePlain && typeof nodePlain === 'object' ? nodePlain[nid] || '' : '';
  return applyRenameMap(src, liveRenameMap());
}

// --- function syncNotesToGraph ---
export function syncNotesToGraph() {
  const env = getEnv();
  if (!env.notes) return 0;
  const map = liveRenameMap();
  if (!map.size) return 0;
  const changed = applyRenamesToNotes(map);
  if (!changed) return 0;
  env.saveNotes ? env.saveNotes() : null;
  try { env.renderNotes(); } catch { /* không phá UI */ }
  if (env.openNoteKey) { try { env.reopenCard(); } catch { /* nt */ } }
  if (env.proseOpen) { try { env.renderProsePanel(); } catch { /* nt */ } }
  return changed;
}

// --- function splitUnanchorable ---
export function splitUnanchorable(list) {
  const live = [], dead = [];
  for (const b of list || []) (b && b.noAnchor ? dead : live).push(b);
  return { live, dead };
}

// --- function orphanEntries ---
export function orphanEntries(dead) {
  const out = {};
  for (const b of dead || []) out[b.ref] = { nodeId: null, anchorRef: null, score: 0, state: 'orphan' };
  return out;
}

// --- function reanchorNotes ---
// opts.quiet: chế độ "thử" (loadSavedNotes dò candidate) — chỉ tính match/counts,
// KHÔNG áp rename, KHÔNG đóng card, KHÔNG render (L6: tránh side effect khi
// candidate bị reject).
export function reanchorNotes(opts) {
  const quiet = !!(opts && opts.quiet);
  const env = getEnv();
  const notes = env.notes;
  if (!notes || !env.graphData || !env.lastParsed) return null;
  const anchors = PcodeCore.buildAnchors(env.graphData);
  const eAnchors = PcodeCore.buildEdgeAnchors(env.graphData);
  const un = splitUnanchorable(notes.blocks);
  const mb = PcodeCore.matchBlocks(un.live, anchors);
  Object.assign(mb.byRef, orphanEntries(un.dead));
  // ref block (lúc export) → nodeId HIỆN TẠI — dùng để khớp edge.
  // QUAN TRỌNG: khoá bằng savedRef (Object.entries) vì se.from/se.to của edge
  // note là ref KHÔNG GIAN CŨ; khoá bằng anchorRef (ref mới) làm edge note
  // orphan/gắn nhầm mũi tên khi đánh số block dịch (L1).
  const refMap = {};
  for (const [ref, v] of Object.entries(mb.byRef)) if (v.nodeId != null) refMap[ref] = v.nodeId;
  const me = PcodeCore.matchEdges(notes.edges, refMap, eAnchors);
  const cnt = (byRef) => {
    let ok = 0, st = 0, or = 0;
    for (const v of Object.values(byRef)) {
      if (v.state === 'ok') ok++; else if (v.state === 'stale') st++; else or++;
    }
    return { ok, stale: st, orphan: or };
  };
  const cb = cnt(mb.byRef), ce = cnt(me.byRef);
  // map ngược cho UI (Phase 4): nodeId → savedRef; edgeIdx → savedRef
  const nodeToSavedRef = {}, edgeIdxToSavedRef = {};
  for (const [ref, v] of Object.entries(mb.byRef)) if (v.nodeId != null) nodeToSavedRef[v.nodeId] = ref;
  for (const [ref, v] of Object.entries(me.byRef)) if (v.idx != null) edgeIdxToSavedRef[v.idx] = ref;
  notes.match = {
    byRef: mb.byRef, edgeByRef: me.byRef, counts: { blocks: cb, edges: ce },
    nodeToSavedRef, edgeIdxToSavedRef,
  };

  // ═══ ĐỒNG BỘ TÊN BIẾN: graph ⇄ notes ═══
  // Gộp rename từ SOURCE (diff anchor) và LIVE (bridge) vào MỘT map rồi áp 1 pass.
  let renamedBlocks = 0;
  if (!quiet) {
    const renameMap = collectRenameMap(anchors, mb);
    renamedBlocks = applyRenamesToNotes(renameMap);
    // rename đã đổi TEXT note → persist ngay, nếu không sẽ mất khi reload (L7)
    if (renamedBlocks > 0 && env.saveNotes) {
      try { env.saveNotes(); } catch { /* opaque origin */ }
    }
    // card đang mở trỏ block/edge đã biến mất → đóng
    if (env.openNoteKey) {
      const v = env.openNoteKey[0] === 'B' ? mb.byRef[env.openNoteKey] : me.byRef[env.openNoteKey];
      if (!v || v.state === 'orphan') {
        env.openNoteKey = null;
        env.closeOpenNote();
      } else if (env.openNoteKey[0] === 'E' && env.openNoteAnchor && env.openNoteAnchor.type === 'edge' && v.idx != null) {
        // rebuild có thể đổi index edge → card phải bám edge ĐÚNG (theo savedRef)
        env.openNoteAnchor.idx = v.idx;
      }
    }
    env.renderNotes();
    if (env.proseOpen) env.renderProsePanel(); // sentences/counts có thể đổi sau re-anchor
    if (env.openNoteKey) env.repositionNoteCard();
  }
  return {
    blockOk: cb.ok, blockStale: cb.stale, blockOrphan: cb.orphan,
    edgeOk: ce.ok, edgeStale: ce.stale, edgeOrphan: ce.orphan,
    // số note vừa được đổi tên theo code — build() dùng để báo cho người dùng
    renamed: renamedBlocks || 0,
  };
}

// --- function shiftBlockRef ---
export function shiftBlockRef(ref, d) {
  if (typeof ref !== 'string') return ref;
  const m = /^B(\d+)$/.exec(ref.trim());
  if (!m) return ref;
  return 'B' + (parseInt(m[1], 10) + d); // B0 vẫn giữ — sẽ thành orphan
}

// --- function refNum ---
export function refNum(ref) {
  const m = /^B(\d+)$/.exec(String(ref == null ? '' : ref).trim());
  return m ? parseInt(m[1], 10) : NaN;
}

// --- function noteIdTokens ---
export function noteIdTokens(text) {
  const out = [];
  const re = /[A-Za-z_][A-Za-z0-9_]{2,}/g;
  let m;
  while ((m = re.exec(String(text || '')))) {
    const t = m[0];
    if (NOTE_STOP.has(t.toLowerCase())) continue;
    out.push(t);
  }
  return out;
}

// --- function detectRefOffset ---
export function detectRefOffset(o, anchors, curEdges) {
  const res = { blockShift: 0, edgeShift: 0, evidence: '' };
  const n = (anchors || []).length;
  const aiBlocks = ((o && o.blocks) || []).filter((b) => b && !isNaN(refNum(b.ref)));
  const aiEdges = ((o && o.edges) || []).filter((e) => e && !isNaN(refNum(e.from)) && !isNaN(refNum(e.to)));
  if (n < 3 || aiBlocks.length < 3) return res;

  /* ---- (1) topology edge ---- */
  const refOfNode = {};
  anchors.forEach((a) => { refOfNode[a.nodeId] = a.ref; });
  const withKind = new Set(), noKind = new Set();
  (curEdges || []).forEach((e) => {
    const f = refOfNode[e.from], t = refOfNode[e.to];
    if (!f || !t) return;
    withKind.add(f + '>' + t + '>' + (e.kind || 'plain'));
    noKind.add(f + '>' + t);
  });
  const edgeScore = {};
  if (aiEdges.length >= 3 && withKind.size) {
    REF_OFFSETS.forEach((d) => {
      let hit = 0, soft = 0;
      aiEdges.forEach((e) => {
        const f = shiftBlockRef(e.from, -d), t = shiftBlockRef(e.to, -d);
        if (withKind.has(f + '>' + t + '>' + (typeof e.kind === 'string' && e.kind ? e.kind : 'plain'))) hit++;
        else if (noKind.has(f + '>' + t)) soft++;
      });
      edgeScore[d] = hit + 0.5 * soft;
    });
    const best = REF_OFFSETS.reduce((a, d) => (edgeScore[d] > edgeScore[a] ? d : a), 0);
    if (best !== 0 && edgeScore[best] > edgeScore[0] && edgeScore[best] >= 0.6 * aiEdges.length) {
      res.edgeShift = best;
      res.evidence = 'edge topology khớp ' + Math.round(edgeScore[best]) + '/' + aiEdges.length +
        ' ở lệch ' + (best > 0 ? '+' : '') + best;
    }
  }

  /* ---- (2) nội dung note vs ids của block ---- */
  const df = {};
  anchors.forEach((a) => { new Set(a.ids || []).forEach((t) => { df[t] = (df[t] || 0) + 1; }); });
  const idf = (t) => Math.log(1 + n / (1 + (df[t] || 0)));
  const toks = aiBlocks.map((b) => noteIdTokens((b.note || '') + ' ' + (b.plain || '')));
  const blockScore = {};
  const oor = {}; // số ref rơi ngoài B1..Bn sau khi dịch
  REF_OFFSETS.forEach((d) => {
    let s = 0, bad = 0;
    aiBlocks.forEach((b, i) => {
      const k = refNum(b.ref) - d; // ref AI B(k) ↔ anchor thứ k (1-based)
      if (k < 1 || k > n) { bad++; return; }
      const a = anchors[k - 1];
      if (!a) return;
      const set = new Set(a.ids || []);
      toks[i].forEach((t) => { if (set.has(t)) s += idf(t); });
    });
    blockScore[d] = s;
    oor[d] = bad;
  });
  const bestB = REF_OFFSETS.reduce((a, d) => (blockScore[d] > blockScore[a] ? d : a), 0);
  const confident = bestB !== 0 && blockScore[bestB] >= 1.0 &&
    blockScore[bestB] >= 1.25 * blockScore[0] && oor[bestB] <= oor[0];
  if (confident) {
    res.blockShift = bestB;
    res.evidence = (res.evidence ? res.evidence + '; ' : '') +
      'nội dung note hợp block hơn ở lệch ' + (bestB > 0 ? '+' : '') + bestB +
      ' (' + blockScore[bestB].toFixed(1) + ' so với ' + blockScore[0].toFixed(1) + ')';
  } else if (res.edgeShift && oor[res.edgeShift] <= oor[0]) {
    // edge đã chắc chắn mà nội dung note không đủ tín hiệu → dịch theo edge.
    res.blockShift = res.edgeShift;
    res.evidence = (res.evidence || '') + ' → áp cùng lệch cho block';
  }
  /* FIX(7): CHỈ ĐƯỢC TỒN TẠI MỘT ĐỘ LỆCH. Nếu blockShift ≠ edgeShift thì
   * applyRefOffset sẽ dịch ref block một đằng, from/to của edge một nẻo → edge
   * trỏ vào block không tồn tại và text note lệch so với ref. Bằng chứng
   * topology (edgeShift) mạnh hơn bằng chứng từ vựng, nên khi mâu thuẫn ta lấy
   * edgeShift và đồng bộ cả hai. */
  if (res.edgeShift && res.blockShift && res.edgeShift !== res.blockShift) {
    res.evidence = (res.evidence || '') +
      '; mâu thuẫn lệch block(' + res.blockShift + ')/edge(' + res.edgeShift +
      ') → chọn theo cấu trúc edge';
    res.blockShift = res.edgeShift;
  } else if (res.blockShift && !res.edgeShift) {
    res.edgeShift = res.blockShift; // edge phải đi cùng block
  }
  return res;
}

// --- function shiftRefsInText ---
export function shiftRefsInText(text, d) {
  return String(text == null ? '' : text).replace(/\bB(\d+)\b/g, (m, n) => 'B' + (parseInt(n, 10) - d));
}

// --- function applyRefOffset ---
export function applyRefOffset(o, off) {
  let moved = 0;
  if (off.blockShift) {
    (o.blocks || []).forEach((b) => {
      if (!b || isNaN(refNum(b.ref))) return;
      const nr = shiftBlockRef(b.ref, -off.blockShift);
      if (nr !== b.ref) { b.ref = nr; moved++; }
    });
  }
  if (off.edgeShift) {
    const de = off.edgeShift;
    (o.edges || []).forEach((e) => {
      if (!e) return;
      if (!isNaN(refNum(e.from))) e.from = shiftBlockRef(e.from, -de);
      if (!isNaN(refNum(e.to))) e.to = shiftBlockRef(e.to, -de);
      if (typeof e.note === 'string') e.note = shiftRefsInText(e.note, de);
    });
  }
  if (off.blockShift) {
    const d = off.blockShift;
    // ref nhắc bên trong text: note/plain của block, note của edge, summary
    (o.blocks || []).forEach((b) => {
      if (!b) return;
      if (typeof b.note === 'string') b.note = shiftRefsInText(b.note, d);
      if (typeof b.plain === 'string') b.plain = shiftRefsInText(b.plain, d);
    });
    // text của EDGE chỉ dịch khi chính from/to của edge cũng lệch.
    const sm = o.summary;
    if (sm && typeof sm === 'object') {
      (Array.isArray(sm.sentences) ? sm.sentences : []).forEach((x) => {
        if (!x) return;
        if (Array.isArray(x.refs)) x.refs = x.refs.map((r) => (isNaN(refNum(r)) ? r : shiftBlockRef(r, -d)));
        if (typeof x.text === 'string') x.text = shiftRefsInText(x.text, d);
      });
      ['sideEffects', 'unknowns'].forEach((k) => {
        if (Array.isArray(sm[k])) sm[k] = sm[k].map((t) => shiftRefsInText(t, d));
      });
    }
  }
  return moved;
}
