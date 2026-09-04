/* =========================================================================
 * PCODE Grapher · src/store/persistence.js — đọc/ghi localStorage
 *
 * QUYẾT ĐỊNH D11 (README §3, SPEC §4): GIỮ NGUYÊN key cũ của v1.9.3.
 *   · App mới đọc và ghi ĐÚNG các key đó.
 *   · KHÔNG tạo key mới, KHÔNG xoá key cũ → người dùng quay lại bản 1.9.3 vẫn còn cấu hình.
 *   · Không có "migrate v2" riêng vì format không đổi.
 *
 * Vì thế KHÔNG dùng `zustand/middleware.persist` (nó gom mọi thứ vào 1 key mới):
 * port thẳng `loadState()/saveState()` của js/ui/main.js.
 * ========================================================================= */

export const LS_SRC = 'pcode.src';
export const LS_OPTS = 'pcode.opts';
export const LS_THEME = 'pcode.theme';
export const LS_SIDEW = 'pcode.sideW';
export const LS_NOTES = 'pcode.notes'; // notes-store.js tự quản (port T6)
export const LS_GHIDRA_URL = 'pcode.ghidra.url';
export const LS_GHIDRA_RECENT = 'pcode.ghidra.recent';

/** cap 2MB — y hệt bản cũ (main.js saveState) */
export const SRC_MAX_BYTES = 2 * 1024 * 1024;

/* localStorage có thể ném ở opaque origin / chế độ riêng tư → mọi truy cập bọc try */
export function lsGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function lsSet(key, val) {
  try {
    localStorage.setItem(key, val);
    return true;
  } catch (e) {
    if (e && e.name === 'QuotaExceededError') return 'quota';
    return false;
  }
}
export function lsRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/* ------------------------------- opts -------------------------------- */

const PRESET_NAMES = ['compact', 'normal', 'wide'];
const NOTES_MODES = ['off', 'badge', 'full'];

/** Mặc định 9 field + notesMode — khớp đúng saveState() cũ. */
export const DEFAULT_OPTS = {
  rankdir: 'TB',
  preset: 'normal',
  colorVars: true,
  dim: true,
  safe: false,
  searchCase: false,
  searchRegex: false,
  searchWord: false,
  searchSolo: false,
  notesMode: 'off',
};

/**
 * Port nguyên văn logic loadState() cũ (phần đọc `pcode.opts`), bỏ phần gán DOM.
 * Giữ y hệt các mặc định "ngầm": rankdir||'TB', preset hợp lệ mới nhận,
 * colorVars !== false, dim !== false, notesMode phải nằm trong 3 giá trị.
 */
export function readOpts() {
  const o = safeParse(lsGet(LS_OPTS));
  if (!o || typeof o !== 'object') return { ...DEFAULT_OPTS };
  return {
    rankdir: o.rankdir === 'LR' ? 'LR' : 'TB',
    preset: PRESET_NAMES.includes(o.preset) ? o.preset : 'normal',
    colorVars: o.colorVars !== false,
    dim: o.dim !== false,
    safe: !!o.safe,
    searchCase: o.searchCase !== undefined ? !!o.searchCase : false,
    searchRegex: o.searchRegex !== undefined ? !!o.searchRegex : false,
    searchWord: o.searchWord !== undefined ? !!o.searchWord : false,
    searchSolo: o.searchSolo !== undefined ? !!o.searchSolo : false,
    notesMode: NOTES_MODES.includes(o.notesMode) ? o.notesMode : 'off',
  };
}

/** Ghi ĐÚNG 10 field như bản cũ (9 field opts + notesMode). */
export function writeOpts(opts) {
  return lsSet(
    LS_OPTS,
    JSON.stringify({
      rankdir: opts.rankdir,
      preset: opts.preset,
      colorVars: opts.colorVars,
      dim: opts.dim,
      safe: opts.safe,
      searchCase: opts.searchCase,
      searchRegex: opts.searchRegex,
      searchWord: opts.searchWord,
      searchSolo: opts.searchSolo,
      notesMode: opts.notesMode,
    })
  );
}

/* -------------------------------- src -------------------------------- */

export function readSrc() {
  return lsGet(LS_SRC);
}

/** Bản cũ: chỉ lưu khi < 2MB (im lặng bỏ qua nếu lớn hơn). */
export function writeSrc(src) {
  const s = String(src == null ? '' : src);
  if (s.length >= SRC_MAX_BYTES) return false;
  return lsSet(LS_SRC, s);
}

/* ------------------------------- theme ------------------------------- */

/** Không có key → theo prefers-color-scheme (giống pre-script trong index.html). */
export function readTheme() {
  const t = lsGet(LS_THEME);
  if (t === 'light' || t === 'dark') return t;
  try {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
  } catch {
    /* ignore */
  }
  return 'dark';
}

export function writeTheme(theme) {
  return lsSet(LS_THEME, theme === 'light' ? 'light' : 'dark');
}

/** Đồng bộ class 'light' trên <html> — 1 nguồn sự thật cho CSS + varColor(). */
export function applyThemeClass(theme) {
  try {
    document.documentElement.classList.toggle('light', theme === 'light');
  } catch {
    /* ignore */
  }
}

/* ------------------------------- sideW ------------------------------- */

/** Bản cũ chỉ nhận bề rộng >= 280px. 0 = chưa đặt (dùng mặc định CSS). */
export function readSideW() {
  const n = parseInt(lsGet(LS_SIDEW) || '0', 10);
  return Number.isFinite(n) && n >= 280 ? n : 0;
}
export function writeSideW(px) {
  return lsSet(LS_SIDEW, String(px | 0));
}
export function clearSideW() {
  lsRemove(LS_SIDEW);
}

/* ---------------------------- ghidra url ----------------------------- */

export function readGhidraUrl() {
  return lsGet(LS_GHIDRA_URL) || '';
}
export function writeGhidraUrl(url) {
  return lsSet(LS_GHIDRA_URL, String(url || ''));
}
export function readGhidraRecent() {
  const a = safeParse(lsGet(LS_GHIDRA_RECENT));
  return Array.isArray(a) ? a.filter((x) => typeof x === 'string') : [];
}
export function writeGhidraRecent(list) {
  return lsSet(LS_GHIDRA_RECENT, JSON.stringify((list || []).slice(0, 8)));
}

/* ------------------------- section collapse -------------------------- */
/* main.js cũ dùng `pcode.coll.i<idx>` cho các <section> gập ở panel trái. */

export function readSectCollapsed(idx) {
  return lsGet('pcode.coll.i' + idx) === 'true';
}
export function writeSectCollapsed(idx, collapsed) {
  return lsSet('pcode.coll.i' + idx, collapsed ? 'true' : 'false');
}

/* --------------------------------------------------------------------- */

function safeParse(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Đọc toàn bộ state đã lưu 1 lần lúc khởi động (SPEC §4 "migrate"). */
export function loadPersisted() {
  return {
    src: readSrc(),
    opts: readOpts(),
    theme: readTheme(),
    sideW: readSideW(),
    ghidraUrl: readGhidraUrl(),
    ghidraRecent: readGhidraRecent(),
  };
}
