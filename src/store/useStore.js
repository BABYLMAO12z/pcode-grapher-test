/* =========================================================================
 * PCODE Grapher · src/store/useStore.js — zustand store (SPEC §3)
 *
 * Thay toàn bộ biến global của js/ui/state.js + js/ui/main.js.
 * Quy tắc: MỌI UI đọc dữ liệu từ đây, không đọc global/DOM khác.
 * Persistence: KHÔNG dùng middleware persist — giữ nguyên key cũ (D11), xem
 * src/store/persistence.js; store chỉ gọi write* khi giá trị đổi.
 * ========================================================================= */

import { create } from 'zustand';
import { PRESETS, srcScopeOf } from '../graph/constants.js';
import {
  loadPersisted, writeOpts, writeSrc, writeTheme, applyThemeClass,
  writeSideW, clearSideW, writeGhidraUrl, writeGhidraRecent,
} from './persistence.js';

const NOTES_MODES = ['off', 'badge', 'full'];

/** ghdr slice — giữ ĐÚNG tên field của js/ui/ghidra.js cũ (FILE-MAP §B). */
export function emptyGhdr() {
  return {
    url: '',
    displayUrl: '',
    token: '',
    connected: false,
    program: null,
    currentAddress: null,
    symByText: {},
    addrToTexts: {},
    evts: null,
    debounce: null,
    session: 0,
    recent: [],
    /* T8: danh sách hàm của bridge (bản cũ nhét thẳng <option> vào #ghFuncs) */
    functions: [],
    functionsHasMore: false,
    functionsLimit: 500,
  };
}

let toastSeq = 0;
/** Thời gian hiện toast (ms) — giữ đúng bản 1.9.3. */
export const TOAST_MS = 3200;

export const useStore = create((set, get) => ({
  /* ---------------- nguồn & graph ---------------- */
  src: '',
  graphData: null,
  lastParsed: null,
  parseMsgs: [],
  renderSeq: 0,
  building: false,
  buildPending: false,
  stats: '',
  /* Tăng mỗi lần build từ đầu (!keepView) thành công → FlowView fitView 1 lần
   * (bản cũ: renderGraph gọi fitView(false) khi !keepView; prop fitView của
   * React Flow chỉ áp lúc mount nên v2 mất hẳn hành vi này). */
  fitNonce: 0,

  /* ---------------- options (persist) ---------------- */
  opts: {
    rankdir: 'TB',
    preset: 'normal',
    colorVars: true,
    dim: true,
    safe: false,
    searchCase: false,
    searchRegex: false,
    searchWord: false,
    searchSolo: false,
  },
  theme: 'dark',

  /* ---------------- layout state ---------------- */
  rfNodes: [],
  rfEdges: [],
  layoutScope: '',
  manualPos: {},
  expanded: {},
  nodeRefMap: {},
  /* ProsePanel 2 chiều (bản cũ highlightSentenceForNode): click block khi panel
   * 📖 đang mở → tô .pl câu có chứa ref của block đó. */
  plNodeRef: null,

  /* ---------------- highlight ---------------- */
  hlKeys: new Set(),
  hlOrder: [],
  hlIdx: -1,
  lit: {},
  dimmed: {},

  /* ---------------- notes ---------------- */
  notes: null,
  notesMode: 'off',
  openNoteKey: null,
  openNoteAnchor: null,
  cardPos: null, // vị trí card do user KÉO (B5) — null = pickCardSlot tự tính
  mainPathOn: false,
  noteReserve: {},

  /* ---------------- ghidra ---------------- */
  ghdr: emptyGhdr(),
  liveNames: new Map(), // D8: text gốc → tên live (Map, không sửa DOM)

  /* ---------------- ui ---------------- */
  ui: {
    dbgOpen: false,
    proseOpen: false,
    pasteOpen: false,
    helpOpen: false,
    sideW: 0,
    toasts: [],
    safeMode: false,
    netStatus: 'offline · không cần cài đặt',
    warn: '',
    errLine: 0,
    dbgLog: [],
    /* T8 — Ghidra Live (bản cũ ghi thẳng vào #ghStatus/#ghSecurity/#ghHelp) */
    ghStatus: '',
    ghState: null,
    ghSecurity: '',
    ghSecurityState: '',
    ghHelp: null,
    flashAddr: null,
  },

  /* =====================================================================
   * ACTIONS — nguồn & options
   * ===================================================================== */

  setSrc(src, { persist = false } = {}) {
    set({ src });
    if (persist) writeSrc(src);
  },

  /** Ghi ngay ra localStorage (auto-save 10s / Ctrl+S gọi hàm này). */
  saveSrc() {
    return writeSrc(get().src);
  },

  setOpt(key, value) {
    const opts = { ...get().opts, [key]: value };
    set({ opts });
    get()._persistOpts(opts);
  },

  setOpts(patch) {
    const opts = { ...get().opts, ...patch };
    set({ opts });
    get()._persistOpts(opts);
  },

  _persistOpts(opts) {
    // notesMode nằm chung key `pcode.opts` như bản cũ, dù trong store nó là slice riêng
    const r = writeOpts({ ...opts, notesMode: get().notesMode });
    if (r === 'quota') get().toast('Bộ nhớ localStorage đầy — state không được lưu');
  },

  toggleRankdir() {
    get().setOpt('rankdir', get().opts.rankdir === 'TB' ? 'LR' : 'TB');
  },

  setTheme(theme) {
    const t = theme === 'light' ? 'light' : 'dark';
    set({ theme: t });
    applyThemeClass(t);
    writeTheme(t);
  },

  toggleTheme() {
    get().setTheme(get().theme === 'light' ? 'dark' : 'light');
  },

  /* =====================================================================
   * ACTIONS — layout scope (port state.js)
   * ===================================================================== */

  /** true = nguồn đổi → manualPos/expanded cũ không còn nghĩa (xoá). */
  adoptSourceScope(text) {
    const k = srcScopeOf(text);
    if (k === get().layoutScope) return false;
    set({ layoutScope: k, manualPos: {}, expanded: {} });
    return true;
  },

  /** Nhận scope mà KHÔNG xoá (import session: layout đi kèm đúng nguồn). */
  setSourceScope(text) {
    set({ layoutScope: srcScopeOf(text) });
  },

  setManualPos(nodeId, pos) {
    set({ manualPos: { ...get().manualPos, [nodeId]: pos } });
  },
  clearManualPos() {
    set({ manualPos: {} });
  },

  toggleExpand(nodeId) {
    const expanded = { ...get().expanded };
    if (expanded[nodeId]) delete expanded[nodeId];
    else expanded[nodeId] = true;
    set({ expanded });
    return !!expanded[nodeId];
  },

  /** Báo FlowView fitView 1 lần sau khi build từ đầu (xem fitNonce ở trên). */
  requestFit() {
    set({ fitNonce: get().fitNonce + 1 });
  },

  /** Nút Clear (port đầy đủ btnClear của main.js cũ): về trạng thái "chưa có gì"
   * — xoá graph + dọn layout scope/manualPos/expanded + highlight. Phần notes
   * (clearNotes + refreshNoteNodes) do lớp UI gọi tiếp cho đúng thứ tự. */
  clearWorkspace() {
    set({
      src: '',
      graphData: null, lastParsed: null, parseMsgs: [],
      rfNodes: [], rfEdges: [], stats: '',
      manualPos: {}, expanded: {},
      layoutScope: srcScopeOf(''),
      hlKeys: new Set(), hlOrder: [], hlIdx: -1, lit: {}, dimmed: {},
      plNodeRef: null,
    });
    get().setWarn('');
    get().setErrLine(0);
    get().setUi({ hlInfo: '', hlTotal: 0 });
    get().saveSrc();
  },

  /* =====================================================================
   * ACTIONS — highlight
   * ===================================================================== */

  setHlKeys(keys) {
    set({ hlKeys: new Set(keys) });
  },

  /** Click token: Ctrl/Cmd = cộng dồn; click thường: bấm token đang sáng
   *  duy nhất → TẮT, ngược lại thay bằng key mới (port nguyên văn interact.js cũ:
   *  nhánh non-ctrl `hlKeys.size===1 && has(key) → clear`, else `{clear; add}` —
   *  bản React trước thiếu nhánh tắt nên click token không bao giờ gỡ highlight). */
  toggleHlKey(key, additive) {
    const cur = get().hlKeys;
    let hlKeys;
    if (additive) {
      hlKeys = new Set(cur);
      if (hlKeys.has(key)) hlKeys.delete(key);
      else hlKeys.add(key);
    } else if (cur.size === 1 && cur.has(key)) {
      hlKeys = new Set();
    } else {
      hlKeys = new Set([key]);
    }
    set({ hlKeys });
    return hlKeys;
  },

  clearHighlight() {
    set({ hlKeys: new Set(), hlOrder: [], hlIdx: -1, lit: {}, dimmed: {} });
  },

  setHighlightResult({ lit, dimmed, order, idx }) {
    set({
      lit: lit || {},
      dimmed: dimmed || {},
      hlOrder: order || [],
      hlIdx: idx === undefined ? -1 : idx,
    });
  },

  setHlIdx(i) {
    set({ hlIdx: i });
  },

  /* =====================================================================
   * ACTIONS — notes
   * ===================================================================== */

  setNotes(notes) {
    set({ notes });
  },

  setNotesMode(mode) {
    if (!NOTES_MODES.includes(mode)) return;
    set({ notesMode: mode });
    get()._persistOpts(get().opts);
  },

  cycleNotesMode() {
    const i = NOTES_MODES.indexOf(get().notesMode);
    get().setNotesMode(NOTES_MODES[(i + 1) % NOTES_MODES.length]);
  },

  openNote(key, anchor = null) {
    set({ openNoteKey: key, openNoteAnchor: anchor, cardPos: null });
  },
  closeNote() {
    set({ openNoteKey: null, openNoteAnchor: null, cardPos: null });
  },
  toggleMainPath() {
    set({ mainPathOn: !get().mainPathOn });
  },
  setNoteReserve(noteReserve) {
    set({ noteReserve: noteReserve || {} });
  },

  /* =====================================================================
   * ACTIONS — ghidra (D8: liveNames là 1 nguồn sự thật)
   * ===================================================================== */

  setGhdr(patch) {
    set({ ghdr: { ...get().ghdr, ...patch } });
  },

  resetGhdr() {
    set({ ghdr: { ...emptyGhdr(), recent: get().ghdr.recent }, liveNames: new Map() });
  },

  setGhidraUrl(url) {
    get().setGhdr({ url });
    writeGhidraUrl(url);
  },

  /* FIX(5): sau khi kết nối, ta chỉ muốn NHỚ chuỗi người dùng gõ (origin đầy đủ)
   * để lần sau điền lại ô nhập — KHÔNG được ghi đè `ghdr.url` vì đó là BASE của
   * fetch, và ở chế độ same-origin base phải là '' (vite proxy /api, /events).
   * Trước đây setGhidraUrl(parsed.display) biến base thành 'http://127.0.0.1:8765'
   * → mọi request sau đó thành cross-origin, hỏng SSE/CORS. */
  rememberGhidraUrl(display) {
    get().setGhdr({ displayUrl: display });
    writeGhidraUrl(display);
  },

  /** Đưa url lên đầu danh sách gần đây, tối đa 8 (giữ hành vi saveRecentUrl cũ). */
  saveRecentUrl(url) {
    if (!url) return get().ghdr.recent;
    const recent = [url, ...get().ghdr.recent.filter((u) => u !== url)].slice(0, 8);
    get().setGhdr({ recent });
    writeGhidraRecent(recent);
    return recent;
  },

  setLiveNames(map) {
    set({ liveNames: map instanceof Map ? map : new Map(Object.entries(map || {})) });
  },

  setLiveName(text, name) {
    const liveNames = new Map(get().liveNames);
    if (name) liveNames.set(text, name);
    else liveNames.delete(text);
    set({ liveNames });
  },

  clearLiveOverlay() {
    set({ liveNames: new Map() });
  },

  /** Tên hiển thị của một token (D8) — CfgNode/CfgEdge/notes/export đều dùng. */
  liveNameOf(text) {
    return get().liveNames.get(text) || text;
  },

  /* =====================================================================
   * ACTIONS — ui
   * ===================================================================== */

  setUi(patch) {
    set({ ui: { ...get().ui, ...patch } });
  },

  setWarn(warn) {
    get().setUi({ warn: warn || '' });
  },

  setErrLine(errLine) {
    get().setUi({ errLine: errLine || 0 });
  },

  /** Toast tự rút sau TOAST_MS (bản cũ: 3.2s) — hàng đợi tối đa 4 cái. */
  toast(msg) {
    const id = ++toastSeq;
    const q = [...get().ui.toasts, { id, msg }].slice(-4);
    get().setUi({ toasts: q });
    setTimeout(() => get().dismissToast(id), TOAST_MS);
    return id;
  },

  dismissToast(id) {
    get().setUi({ toasts: get().ui.toasts.filter((t) => t.id !== id) });
  },

  setSideW(px) {
    get().setUi({ sideW: px });
    /* FIX(29): kéo panel hẹp hơn 280 mà KHÔNG xoá key thì reload lại nhảy về bề
     * rộng cũ (readSideW bỏ qua giá trị < 280). Hẹp = "về mặc định" ⇒ xoá key. */
    if (px >= 280) writeSideW(px);
    else clearSideW();
  },

  resetSideW() {
    get().setUi({ sideW: 0 });
    clearSideW();
  },

  toggleSafeMode() {
    const safe = !get().opts.safe;
    get().setOpt('safe', safe);
    get().setUi({ safeMode: safe });
  },

  dbgLog(msg) {
    const log = [...get().ui.dbgLog, { t: Date.now(), msg: String(msg) }];
    get().setUi({ dbgLog: log.slice(-200) });
  },

  /* =====================================================================
   * SESSION — nạp state từ file .session.json (F10)
   * Phần đọc/ghi file + validate nằm ở T9; ở đây chỉ là bước ĐẶT STATE.
   * Dùng setSourceScope (KHÔNG adopt) vì layout đi kèm đúng nguồn vừa import.
   * ===================================================================== */

  applySessionState(sess) {
    if (!sess || typeof sess !== 'object') return false;
    const patch = {};
    if (typeof sess.src === 'string') patch.src = sess.src;
    if (sess.manualPos && typeof sess.manualPos === 'object') patch.manualPos = { ...sess.manualPos };
    if (sess.expanded && typeof sess.expanded === 'object') patch.expanded = { ...sess.expanded };
    if (Array.isArray(sess.hlKeys)) {
      patch.hlKeys = new Set(sess.hlKeys);
      /* FIX(25): lit/dimmed/hlOrder là KẾT QUẢ tính từ hlKeys + graph. Nhập
       * session mà giữ nguyên kết quả cũ → ô tìm kiếm hiện key mới trong khi
       * graph sáng theo key CŨ và ◀/▶ nhảy theo danh sách cũ (chỉ số ngoài
       * phạm vi). Xoá để lớp UI tính lại sau khi build xong. */
      patch.lit = {};
      patch.dimmed = {};
      patch.hlOrder = [];
      patch.hlIdx = -1;
    }
    if (sess.notes !== undefined) patch.notes = sess.notes;
    if (NOTES_MODES.includes(sess.notesMode)) patch.notesMode = sess.notesMode;

    const opts = { ...get().opts };
    if (sess.rankdir === 'TB' || sess.rankdir === 'LR') opts.rankdir = sess.rankdir;
    if (PRESETS[sess.preset]) opts.preset = sess.preset;
    if (typeof sess.colorVars === 'boolean') opts.colorVars = sess.colorVars;
    patch.opts = opts;

    set(patch);
    if (typeof sess.src === 'string') get().setSourceScope(sess.src);
    if (sess.theme === 'light' || sess.theme === 'dark') get().setTheme(sess.theme);
    get()._persistOpts(opts);
    return true;
  },

  /** State hiện tại → object session (T9 sẽ bọc thành file JSON). */
  sessionState() {
    const s = get();
    return {
      src: s.src,
      manualPos: s.manualPos,
      expanded: s.expanded,
      hlKeys: [...s.hlKeys],
      rankdir: s.opts.rankdir,
      preset: s.opts.preset,
      colorVars: s.opts.colorVars,
      theme: s.theme,
      notes: s.notes,
      notesMode: s.notesMode,
    };
  },

  /* =====================================================================
   * KHỞI ĐỘNG — đọc key cũ 1 lần (SPEC §4)
   * ===================================================================== */

  hydrate() {
    const p = loadPersisted();
    const { notesMode, ...opts } = p.opts;
    set({
      src: p.src || '',
      opts,
      notesMode,
      theme: p.theme,
      ui: { ...get().ui, sideW: p.sideW, safeMode: !!opts.safe },
      /* FIX(24): `pcode.ghidra.url` lưu chuỗi NGƯỜI DÙNG GÕ (origin đầy đủ) —
       * đó là displayUrl, KHÔNG phải base fetch. Đổ nó vào `url` như trước làm
       * base fetch thành cross-origin ngay từ lúc khởi động (ngược với FIX(5));
       * ghidraConnect() sẽ tự đặt lại `url` = parsed.base khi kết nối. */
      ghdr: { ...get().ghdr, displayUrl: p.ghidraUrl, recent: p.ghidraRecent },
    });
    applyThemeClass(p.theme);
    // FIX(10): '' hay chuỗi toàn khoảng trắng KHÔNG phải là source đã lưu.
    // p.src != null khiến App bỏ qua nội dung mẫu và hiện đồ thị rỗng.
    return { hadSrc: typeof p.src === 'string' && p.src.trim().length > 0 };
  },

  /** Chỉ dùng trong test — đưa store về mặc định. */
  _resetForTest() {
    set({
      src: '', graphData: null, lastParsed: null, parseMsgs: [], renderSeq: 0,
      building: false, buildPending: false, stats: '', fitNonce: 0, plNodeRef: null,
      opts: {
        rankdir: 'TB', preset: 'normal', colorVars: true, dim: true, safe: false,
        searchCase: false, searchRegex: false, searchWord: false, searchSolo: false,
      },
      theme: 'dark',
      rfNodes: [], rfEdges: [], layoutScope: '', manualPos: {}, expanded: {}, nodeRefMap: {},
      hlKeys: new Set(), hlOrder: [], hlIdx: -1, lit: {}, dimmed: {},
      notes: null, notesMode: 'off', openNoteKey: null, openNoteAnchor: null, cardPos: null,
      mainPathOn: false, noteReserve: {},
      ghdr: emptyGhdr(), liveNames: new Map(),
      ui: {
        dbgOpen: false, proseOpen: false, pasteOpen: false, helpOpen: false, sideW: 0,
        ghStatus: '', ghState: null, ghSecurity: '', ghSecurityState: '', ghHelp: null, flashAddr: null,
        toasts: [], safeMode: false, netStatus: 'offline · không cần cài đặt',
        warn: '', errLine: 0, dbgLog: [],
      },
    });
  },
}));

/** Preset hiện hành (nodesep/ranksep/edgesep) — tiện cho layout. */
export function currentPreset(state) {
  return PRESETS[state.opts.preset] || PRESETS.normal;
}

export default useStore;
