/* =========================================================================
 * PCODE Grapher · src/notes/store.js
 * PORT NGUYÊN VĂN js/ui/notes-store.js (415 dòng) — persistence `pcode.notes`
 * (LRU 8 hàm / 2 MB) + import JSON của AI + clear.
 *
 * Khác bản cũ DUY NHẤT ở chỗ lấy dữ liệu: global → getEnv(); `$('#src').value`
 * → env.src. Key localStorage, schema payload v2 và fallback v1 GIỮ NGUYÊN (D11).
 * ========================================================================= */

import * as PcodeCore from '../core/index.js';
import { srcScopeOf } from '../graph/constants.js';
import { getEnv } from './env.js';
import {
  reanchorNotes, orphanEntries, detectRefOffset, applyRefOffset,
} from './anchors.js';
import { tryApplySingleNote } from './ai.js';

// --- const NOTES_LS_KEY ---
export const NOTES_LS_KEY = 'pcode.notes';

// --- const NOTES_MAX_BYTES ---
export const NOTES_MAX_BYTES = 2 * 1024 * 1024;

// --- const NOTES_MAX_ENTRIES ---
export const NOTES_MAX_ENTRIES = 8; // số hàm nhớ notes (LRU) — chống phình localStorage

// --- function stripJsonFence ---
export function stripJsonFence(text) {
  let s = String(text == null ? '' : text).trim();
  const m = s.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/i);
  if (m) s = m[1].trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  return s;
}

// --- function validateNotesJson ---
export function validateNotesJson(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return 'không phải object JSON';
  if (!Array.isArray(o.blocks)) return 'thiếu mảng "blocks"';
  if (!o.blocks.length) return '"blocks" rỗng';
  for (const b of o.blocks) {
    if (!b || typeof b.ref !== 'string' || !String(b.ref).trim()) return 'blocks[] thiếu "ref"';
    if (typeof b.note !== 'string' || !b.note.trim()) return 'blocks[' + b.ref + '] thiếu "note"';
  }
  if (o.edges != null && !Array.isArray(o.edges)) return '"edges" phải là mảng';
  for (const e of o.edges || []) {
    if (!e || typeof e.ref !== 'string' || !String(e.ref).trim()) return 'edges[] thiếu "ref"';
    if (typeof e.note !== 'string' || !e.note.trim()) return 'edges[' + (e.ref || '?') + '] thiếu "note"';
  }
  return null;
}

// --- function currentFnKey ---
export function currentFnKey() {
  const lastParsed = getEnv().lastParsed;
  if (!lastParsed) return '';
  const h = (lastParsed.header || []).map((t) => t.v).join(' ');
  return PcodeCore.fnv1a(h + '\u0000' + (lastParsed.fn || ''));
}

// --- function emptyNotesStore ---
export function emptyNotesStore() { return { v: 2, byHash: {}, order: [] }; }

// --- function notesStoreRead ---
export function notesStoreRead() {
  try {
    const raw = localStorage.getItem(NOTES_LS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p) return null;
    if (p.v === 2 && p.byHash && typeof p.byHash === 'object') {
      if (!Array.isArray(p.order)) p.order = Object.keys(p.byHash);
      return p;
    }
    if (p.notes && Array.isArray(p.notes.blocks)) { // ← payload v1
      const st = emptyNotesStore();
      const key = p.srcHash || srcScopeOf(getEnv().src || '');
      st.byHash[key] = {
        fn: p.fn || '', savedAt: p.savedAt || Date.now(),
        fnKey: (p.notes.meta && p.notes.meta.fnKey) || '', notes: p.notes,
      };
      st.order = [key];
      return st;
    }
  } catch { /* payload hỏng / opaque origin → coi như chưa có */ }
  return null;
}

// --- function notesStoreWrite ---
export function notesStoreWrite(store, activeKey) {
  // entry "đang xem" cũng nằm ở cấp cao nhất (tương thích payload v1).
  const e = store.byHash[activeKey] || null;
  store.v = 2;
  store.srcHash = activeKey;
  store.fn = (e && e.fn) || '';
  store.savedAt = (e && e.savedAt) || Date.now();
  store.notes = (e && e.notes) || null;
  // trim: không bao giờ bỏ entry ACTIVE; ưu tiên bỏ entry cũ nhất
  while (store.order.length > NOTES_MAX_ENTRIES) {
    const drop = store.order.find((h) => h !== activeKey) || store.order[0];
    store.order = store.order.filter((h) => h !== drop);
    delete store.byHash[drop];
  }
  let s = JSON.stringify(store);
  while (s.length > NOTES_MAX_BYTES && store.order.length > 1) {
    const drop = store.order.find((h) => h !== activeKey) || store.order[0];
    store.order = store.order.filter((h) => h !== drop);
    delete store.byHash[drop];
    s = JSON.stringify(store);
  }
  if (s.length > NOTES_MAX_BYTES) {
    getEnv().toast('Notes quá lớn (>2 MB) — không tự lưu, hãy Save session');
    return;
  }
  localStorage.setItem(NOTES_LS_KEY, s);
}

// --- function saveNotes ---
export function saveNotes() {
  const env = getEnv();
  const notes = env.notes;
  if (!notes) return;
  try {
    const key = srcScopeOf(env.src || '');
    const store = notesStoreRead() || emptyNotesStore();
    store.byHash[key] = {
      fn: (notes.meta && notes.meta.fn) || '',
      fnKey: (notes.meta && notes.meta.fnKey) || currentFnKey(),
      savedAt: Date.now(), notes,
    };
    store.order = (store.order || []).filter((h) => h !== key);
    store.order.push(key);
    notesStoreWrite(store, key);
  } catch (e) {
    if (e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
      env.toast('localStorage đầy — notes không được lưu');
    }
  }
}

// --- function isPlausibleMatch ---
export function isPlausibleMatch(r) {
  const total = (r.blockOk || 0) + (r.blockStale || 0) + (r.blockOrphan || 0);
  const matched = (r.blockOk || 0) + (r.blockStale || 0);
  if (!total) return false;
  if (total < 3) return matched > 0;
  return matched / total >= 0.5;
}

// --- function loadSavedNotes ---
export function loadSavedNotes() {
  const env = getEnv();
  const store = notesStoreRead();
  if (!store) return false;
  const key = srcScopeOf(env.src || '');
  const curKey = currentFnKey();
  const seen = new Set();
  const cands = [];
  const push = (e) => { if (e && !seen.has(e)) { seen.add(e); cands.push(e); } };
  push(store.byHash[key]);
  (store.order || []).slice().reverse().forEach((h) => {
    const e = store.byHash[h];
    if (curKey && e && e.fnKey && e.fnKey === curKey) push(e);
  });
  (store.order || []).slice().reverse().forEach((h) => push(store.byHash[h])); // last-resort
  for (const e of cands) {
    if (!e || !e.notes || !Array.isArray(e.notes.blocks) || !e.notes.blocks.length) continue;
    env.notes = e.notes;
    if (!env.notes.meta) env.notes.meta = {};
    // THỬ candidate ở chế độ quiet — không rename/đóng card/render khi chưa chắc nhận (L6)
    const r = reanchorNotes({ quiet: true });
    if (!r || !isPlausibleMatch(r)) {
      env.notes = null; // không phải notes của hàm này
      continue;
    }
    reanchorNotes(); // nhận candidate → chạy đầy đủ (rename + UI)
    // Đổi tên hàm / notes bản cũ chưa có fnKey → đóng dấu lại theo hàm hiện tại.
    if (curKey && env.notes.meta.fnKey !== curKey) { env.notes.meta.fnKey = curKey; saveNotes(); }
    return true;
  }
  // không ứng viên nào hợp lệ: dọn badge/card có thể đã vẽ trong lúc thử
  env.notes = null;
  env.closeOpenNote();
  try { env.renderNotes(); } catch { /* nt */ }
  return false;
}

// --- function detachNotes ---
export function detachNotes() {
  const env = getEnv();
  if (!env.notes) return false;
  if (env.mainPathOn) env.clearMainPath(true);
  if (env.proseOpen) env.toggleProsePanel(false);
  env.notes = null;
  env.openNoteKey = null;
  env.mainPathOn = false;
  env.closeOpenNote();
  try { env.renderNotes(); } catch { /* nt */ }
  return true;
}

// --- function syncNotesWithGraph ---
export function syncNotesWithGraph() {
  const env = getEnv();
  const curKey = currentFnKey();
  // notes trong bộ nhớ là của HÀM KHÁC → gỡ ra
  if (env.notes && curKey && env.notes.meta && env.notes.meta.fnKey && env.notes.meta.fnKey !== curKey) {
    detachNotes();
  }
  if (env.notes && env.notes.meta && !env.notes.meta.fnKey && curKey) env.notes.meta.fnKey = curKey;
  let autoApplied = false, renamed = 0;
  if (!env.notes) autoApplied = loadSavedNotes(); // loadSavedNotes tự re-anchor
  else { const r = reanchorNotes(); renamed = r ? r.renamed || 0 : 0; }
  return { autoApplied, renamed };
}

// --- function clearNotes ---
export function clearNotes(save) {
  const env = getEnv();
  const had = !!env.notes;
  if (env.mainPathOn) env.clearMainPath(true); // dọn .lit/.dimmed trước khi reset
  if (env.proseOpen) env.toggleProsePanel(false); // đóng panel 📖
  env.notes = null;
  env.openNoteKey = null;
  env.mainPathOn = false;
  if (env.notesMode !== 'off') env.notesMode = 'off';
  try {
    const key = srcScopeOf(env.src || '');
    const curKey = currentFnKey();
    const store = notesStoreRead();
    if (store) {
      // Xoá MỌI phiên bản notes của HÀM NÀY (cùng fnKey, khác srcHash) — nếu chỉ
      // xoá srcHash hiện tại thì bản cũ sẽ được nạp lại ngay lần build sau.
      const doomed = (store.order || []).filter((h) => {
        const e = store.byHash[h];
        return h === key || (!!curKey && e && e.fnKey === curKey);
      });
      doomed.forEach((h) => { delete store.byHash[h]; });
      store.order = (store.order || []).filter((h) => doomed.indexOf(h) < 0);
      if (!store.order.length) localStorage.removeItem(NOTES_LS_KEY);
      else notesStoreWrite(store, store.order[store.order.length - 1]);
    } else localStorage.removeItem(NOTES_LS_KEY);
  } catch { /* opaque origin */ }
  env.closeOpenNote();
  env.clearMainPath();
  env.renderNotes();
  if (save) env.saveState();
  if (had) env.toast('Đã xoá AI notes');
  return had;
}

// --- function dropSavedNotesForCurrentSource ---
export function dropSavedNotesForCurrentSource() {
  try {
    const key = srcScopeOf(getEnv().src || '');
    const store = notesStoreRead();
    if (!store || !store.byHash[key]) return;
    delete store.byHash[key];
    store.order = (store.order || []).filter((h) => h !== key);
    if (!store.order.length) localStorage.removeItem(NOTES_LS_KEY);
    else notesStoreWrite(store, store.order[store.order.length - 1]);
  } catch { /* opaque origin */ }
}

// --- function importAINotes ---
export function importAINotes(text) {
  const env = getEnv();
  if (!env.graphData || !env.lastParsed) { env.toast('Build graph trước khi import notes'); return null; }
  let o;
  try { o = JSON.parse(stripJsonFence(text)); }
  catch (e) { env.toast('File notes không phải JSON hợp lệ: ' + e.message); return null; }
  const verr = validateNotesJson(o);
  if (verr) {
    // 📋 prompt của card chỉ trả MỘT note {"ref","note","plain"} — chấp nhận shape này.
    const single = tryApplySingleNote(o);
    if (single) return single;
    env.toast('File notes sai schema: ' + verr);
    return null;
  }

  const anchors = PcodeCore.buildAnchors(env.graphData);
  const anchorByRef = {};
  anchors.forEach((a) => { anchorByRef[a.ref] = a; });

  // AI hay đánh số block lệch +1 → phát hiện theo topology edge + nội dung note.
  const off = detectRefOffset(o, anchors, env.graphData.edges || []);
  const moved = off.blockShift || off.edgeShift ? applyRefOffset(o, off) : 0;

  // originalTokens = TÊN BIẾN TRONG CODE TẠI THỜI ĐIỂM IMPORT (baseline rename).
  let blocks = (o.blocks || []).map((b) => {
    const a = anchorByRef[b.ref] || null;
    const baseline = a && Array.isArray(a.ids) && a.ids.length
      ? a.ids.slice()
      : Array.isArray(b.tokens) ? b.tokens.slice() : Array.isArray(b.ids) ? b.ids.slice() : [];
    return {
      ref: b.ref,
      note: String(b.note),
      plain: typeof b.plain === 'string' ? b.plain : '',
      manual: !!b.manual,
      kind: a ? a.kind : typeof b.kind === 'string' ? b.kind : '',
      lines: a ? a.lines : null,
      skeleton: a ? a.skeleton : '',
      skHash: a ? a.skHash : '',
      ids: a ? a.ids : Array.isArray(b.tokens) ? b.tokens : Array.isArray(b.ids) ? b.ids : [],
      originalTokens: baseline,
      // ref không có trên đồ thị → re-anchor sau này KHÔNG tự bịa chỗ bám.
      noAnchor: !a,
    };
  });

  // edges: khớp lại bằng matchEdges; label lấy từ graph HIỆN TẠI.
  const mb = PcodeCore.matchBlocks(
    blocks.filter((b) => !b.noAnchor).map((b) => ({
      ref: b.ref, kind: b.kind, lines: b.lines, skeleton: b.skeleton, skHash: b.skHash, ids: b.ids,
    })),
    anchors
  );
  Object.assign(mb.byRef, orphanEntries(blocks.filter((b) => b.noAnchor)));
  const refMap = {};
  // khoá bằng savedRef (e.from/e.to là ref của JSON AI) — xem L1 trong BUG-REPORT
  for (const [ref, v] of Object.entries(mb.byRef)) if (v.nodeId != null) refMap[ref] = v.nodeId;
  const curEdges = env.graphData.edges || [];
  let edges = (o.edges || []).map((e) => {
    let label = typeof e.label === 'string' ? e.label : '';
    const f = refMap[e.from], t = refMap[e.to];
    if (f != null && t != null) {
      const hit = curEdges.find((x) => x.from === f && x.to === t && (!e.kind || x.kind === e.kind))
        || curEdges.find((x) => x.from === f && x.to === t);
      if (hit) label = hit.elabel || '';
    }
    return {
      ref: e.ref,
      from: typeof e.from === 'string' ? e.from : '',
      to: typeof e.to === 'string' ? e.to : '',
      kind: typeof e.kind === 'string' ? e.kind : '',
      label,
      note: String(e.note),
      manual: !!e.manual,
    };
  });

  // summary (tuỳ chọn — 📖 panel Phase 5)
  const sm = o.summary && typeof o.summary === 'object' ? o.summary : {};
  const summary = {
    sentences: (Array.isArray(sm.sentences) ? sm.sentences : [])
      .filter((s) => s && typeof s.text === 'string' && s.text.trim())
      .map((s) => ({ text: s.text, refs: (Array.isArray(s.refs) ? s.refs : []).filter((r) => typeof r === 'string') })),
    sideEffects: (Array.isArray(sm.sideEffects) ? sm.sideEffects : []).map(String),
    unknowns: (Array.isArray(sm.unknowns) ? sm.unknowns : []).map(String),
  };

  // Mode off → FULL TRƯỚC khi reanchor để renderNotes() vẽ ngay.
  if (env.notesMode === 'off') env.notesMode = 'full';
  // REPLACE notes cũ — nhưng BẢO VỆ note MANUAL (✎ sửa trong card).
  let keptB = 0, keptE = 0;
  if (env.notes) {
    const oldB = {}, oldE = {};
    (env.notes.blocks || []).forEach((b) => { if (b && b.manual) oldB[b.ref] = b; });
    (env.notes.edges || []).forEach((e) => { if (e && e.manual) oldE[e.ref] = e; });
    blocks = blocks.map((b) => {
      const k = oldB[b.ref];
      if (k) { b.note = k.note; if (k.plain) b.plain = k.plain; b.manual = true; keptB++; }
      return b;
    });
    edges = edges.map((e) => {
      const k = oldE[e.ref];
      if (k) { e.note = k.note; e.manual = true; keptE++; }
      return e;
    });
  }
  const keptManual = keptB + keptE;
  env.notes = { meta: o.meta && typeof o.meta === 'object' ? o.meta : {}, blocks, edges, summary, match: null };
  // fnKey do TOOL tính (không dùng meta.headerHash của AI).
  env.notes.meta.fnKey = currentFnKey();
  const counts = reanchorNotes();

  // header không khớp = notes có vẻ của hàm khác → warn nhưng VẪN nạp (D11)
  let warn = '';
  const curHeader = (env.lastParsed.header || []).map((t) => t.v).join(' ');
  if (env.notes.meta.headerHash && env.notes.meta.headerHash !== PcodeCore.fnv1a(curHeader)) {
    warn = 'notes có vẻ thuộc hàm khác (header không khớp) — vẫn nạp, note có thể ✗';
    env.setWarn('⚠ ' + warn);
  }
  saveNotes();
  env.saveState();
  const nb = counts ? counts.blockOk + counts.blockStale + counts.blockOrphan : blocks.length;
  const ne = counts ? counts.edgeOk + counts.edgeStale + counts.edgeOrphan : edges.length;
  const st = counts ? counts.blockStale + counts.edgeStale : 0;
  const or = counts ? counts.blockOrphan + counts.edgeOrphan : 0;
  if (moved) {
    env.toast('⚠ AI đánh số block lệch ' + (off.blockShift > 0 ? '+' : '') + off.blockShift +
      ' — tool đã tự dịch ' + moved + ' note về đúng block (' + (off.evidence || '') + ')');
  } else if (or) {
    env.toast('Đã nạp ' + (nb + ne) + ' note · ' + st + ' ⚠ · ' + or +
      ' ✗ không khớp — kiểm tra AI có ghi ref ngoài khoảng B1..B' + anchors.length + ' không');
  } else {
    env.toast('Đã nạp ' + (nb + ne) + ' note · ' + st + ' ⚠ · ' + or + ' ✗' +
      (keptManual ? ' · giữ ' + keptManual + ' ✎ manual' : ''));
  }
  // Mode full: LAYOUT LẠI để thuật toán dự trù chỗ cho ô note.
  if (env.notesMode === 'full' && env.lastParsed) {
    try { env.rerender({ keepView: true }); } catch { /* layout cũ vẫn dùng được */ }
  }
  return {
    ok: true, counts, warn, keptManual,
    refShift: off.blockShift || off.edgeShift
      ? { blocks: off.blockShift, edges: off.edgeShift, moved, evidence: off.evidence }
      : null,
  };
}
