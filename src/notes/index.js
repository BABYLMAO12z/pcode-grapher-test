/* =========================================================================
 * PCODE Grapher · src/notes/index.js — nối 3 module notes vào zustand store
 *
 * Bản cũ dùng biến global chung cho notes + graph; v2 giữ nguồn sự thật ở store.
 * `syncEnvFromStore()` bơm dữ liệu store → env trước mỗi thao tác, rồi
 * `pushEnvToStore()` đẩy các field env đã bị logic port sửa (notes, notesMode,
 * openNoteKey/Anchor, mainPathOn) trở lại store để React re-render.
 * ========================================================================= */

import { useStore } from '../store/useStore.js';
import { getEnv, setEnv, makeEnv } from './env.js';
import { getPlainText, getAllPlainText, setNotesSync } from '../graph/build.js';
import * as anchors from './anchors.js';
import * as notesStore from './store.js';
import * as ai from './ai.js';

export * from './anchors.js';
export * from './store.js';
export * from './ai.js';
export { getEnv, setEnv, makeEnv } from './env.js';

/** Bơm state hiện tại của store vào env (gọi TRƯỚC mỗi thao tác notes). */
export function syncEnvFromStore() {
  const s = useStore.getState();
  const env = getEnv();
  env.notes = s.notes;
  env.graphData = s.graphData;
  env.lastParsed = s.lastParsed;
  env.nodePlain = getAllPlainText();
  env.src = s.src;
  env.notesMode = s.notesMode;
  env.openNoteKey = s.openNoteKey;
  env.openNoteAnchor = s.openNoteAnchor;
  env.mainPathOn = s.mainPathOn;
  env.proseOpen = s.ui.proseOpen;
  env.GHDR = s.ghdr && s.ghdr.connected ? s.ghdr : null;
  return env;
}

/** Đẩy phần env bị logic port thay đổi trở lại store. */
export function pushEnvToStore(opts = {}) {
  const mutates = opts.mutates !== false;
  const env = getEnv();
  const s = useStore.getState();
  const patch = {};
  if (env.notes !== s.notes) patch.notes = env.notes;
  if (env.notesMode !== s.notesMode) patch.notesMode = env.notesMode;
  if (env.openNoteKey !== s.openNoteKey) patch.openNoteKey = env.openNoteKey;
  if (env.openNoteAnchor !== s.openNoteAnchor) patch.openNoteAnchor = env.openNoteAnchor;
  if (env.mainPathOn !== s.mainPathOn) patch.mainPathOn = env.mainPathOn;
  // notes là object bị sửa TẠI CHỖ (port nguyên văn) → ép tham chiếu mới để
  // zustand/React nhận ra thay đổi.
  if (mutates && !('notes' in patch) && env.notes) patch.notes = { ...env.notes };
  if (Object.keys(patch).length) useStore.setState(patch);
  // notesMode đổi qua env (clearNotes→'off', importAINotes→'full') phải persist
  // vào pcode.opts như setNotesMode — nếu không reload lại thấy mode cũ (L5).
  if ('notesMode' in patch) {
    const st = useStore.getState();
    st._persistOpts(st.opts);
  }
}

/** Nối env với store + toast/persist thật. Gọi 1 lần khi app khởi động. */
export function installNotesEnv() {
  const env = makeEnv({
    toast: (msg) => useStore.getState().toast(msg),
    saveState: () => useStore.getState().saveSrc(),
    setWarn: (msg) => useStore.getState().setUi({ warn: msg }),
    saveNotes: () => notesStore.saveNotes(),
    rerender: () => {},
    // hook UI của bản cũ: React tự render theo store → chỉ cần đẩy env ra store
    renderNotes: () => {},
    closeOpenNote: () => { getEnv().openNoteKey = null; getEnv().openNoteAnchor = null; },
    reopenCard: () => {},
    repositionNoteCard: () => {},
    renderProsePanel: () => {},
    clearMainPath: () => { getEnv().mainPathOn = false; },
    toggleProsePanel: (on) => { useStore.getState().setUi({ proseOpen: !!on }); getEnv().proseOpen = !!on; },
  });
  setEnv(env);
  setNotesSync(() => syncNotesWithGraph());
  return env;
}

/**
 * Bọc một hàm port: sync → chạy → push.
 * FIX(12a): try/finally — trước đây fn() ném lỗi thì pushEnvToStore() không
 * chạy, env đã bị sửa TẠI CHỖ nhưng store giữ tham chiếu cũ → UI lệch với dữ
 * liệu thật cho tới lần thao tác sau.
 * FIX(12b): `mutates:false` cho các hàm CHỈ ĐỌC — pushEnvToStore luôn clone
 * `{...env.notes}` nên mỗi lần render tooltip/prompt lại tạo tham chiếu notes
 * mới → mọi subscriber notes re-render vô ích (và vòng lặp render trong panel).
 */
function wrap(fn, opts = {}) {
  const mutates = opts.mutates !== false;
  return (...args) => {
    syncEnvFromStore();
    try {
      return fn(...args);
    } finally {
      pushEnvToStore({ mutates });
    }
  };
}

/* --- API cho UI / window.__pcode (giữ đúng tên D10) --- */
export const importAINotes = wrap(notesStore.importAINotes);
export const clearNotes = wrap(notesStore.clearNotes);
export const syncNotesWithGraph = wrap(notesStore.syncNotesWithGraph);
export const loadSavedNotes = wrap(notesStore.loadSavedNotes);
export const reanchorNotes = wrap(anchors.reanchorNotes);
export const syncNotesToGraph = wrap(anchors.syncNotesToGraph);
export const dropSavedNotesForCurrentSource = wrap(notesStore.dropSavedNotesForCurrentSource);
export const exportAIData = wrap(ai.exportAIData, { mutates: false });
export const aiDataJson = wrap(ai.aiDataJson, { mutates: false });
export const aiPromptText = wrap(ai.aiPromptText, { mutates: false });
export const notePromptFor = wrap(ai.notePromptFor, { mutates: false });
export const displayCodeOf = wrap((nid) => anchors.applyRenameMap(getPlainText(nid), anchors.liveRenameMap()), { mutates: false });

/** notesState() cho window.__pcode (SPEC §8.3). */
export function notesState() {
  const s = useStore.getState();
  const n = s.notes;
  return {
    notes: !!n,
    mode: s.notesMode,
    open: s.openNoteKey,
    counts: n && n.match ? n.match.counts : null,
    summary: n && n.summary
      ? {
          sentences: n.summary.sentences.length,
          sideEffects: n.summary.sideEffects.length,
          unknowns: n.summary.unknowns.length,
        }
      : null,
  };
}
