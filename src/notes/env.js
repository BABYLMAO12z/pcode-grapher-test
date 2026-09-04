/* =========================================================================
 * PCODE Grapher · src/notes/env.js — lớp thay GLOBAL cho 3 file notes port
 *
 * Bản cũ (js/ui/notes-*.js) đọc thẳng biến toàn cục: notes, graphData,
 * lastParsed, nodePlain, notesMode, openNoteKey, openNoteAnchor, mainPathOn,
 * proseOpen, GHDR, $('#src'), toast(), saveState(), renderNotes()…
 * Để PORT NGUYÊN VĂN logic (yêu cầu hợp đồng) mà không sửa từng dòng, ta gom
 * mọi truy cập đó vào một đối tượng `env` duy nhất; `src/notes/index.js` nối
 * env vào zustand store. Test có thể thay env bằng bản giả.
 *
 * Các hook UI của bản cũ (renderNotes/reopenCard/repositionNoteCard/
 * renderProsePanel/closeOpenNote) trong v2 là KHÔNG CẦN — React tự re-render
 * theo store — nên mặc định là no-op; giữ tên để logic port khỏi phải sửa.
 * ========================================================================= */

/** @returns {object} env mặc định — độc lập, dùng cho test thuần logic. */
export function makeEnv(init = {}) {
  const env = {
    /* --- dữ liệu --- */
    notes: null,
    graphData: null,
    lastParsed: null,
    nodePlain: {},
    src: '',

    /* --- trạng thái notes/UI --- */
    notesMode: 'off',
    openNoteKey: null,
    openNoteAnchor: null,
    mainPathOn: false,
    proseOpen: false,

    /* --- bridge Ghidra (D8) --- */
    GHDR: null,

    /* --- side effect --- */
    toast: () => {},
    saveState: () => {},
    setWarn: () => {},
    /** layout lại (mode full cần chỗ cho ô note) — import gọi. */
    rerender: () => {},

    /* --- hook UI bản cũ: no-op trong v2 --- */
    renderNotes: () => {},
    reopenCard: () => {},
    repositionNoteCard: () => {},
    renderProsePanel: () => {},
    closeOpenNote: () => {},
    clearMainPath: () => {},
    toggleProsePanel: () => {},

    ...init,
  };
  return env;
}

/** env hiện hành (module-level, giống global cũ nhưng thay được). */
let current = makeEnv();

export function getEnv() {
  return current;
}

export function setEnv(env) {
  current = env;
  return current;
}

export function resetEnv(init) {
  current = makeEnv(init);
  return current;
}
