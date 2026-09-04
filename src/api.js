/* =========================================================================
 * PCODE Grapher · src/api.js — window.__pcode (D10, SPEC §8.3)
 * Giữ ĐÚNG 17 tên hàm và ĐÚNG chức năng của bản 1.9.3 (js/ui/main.js).
 * Mọi hàm chỉ đọc store / gọi action — không giữ trạng thái riêng.
 * ========================================================================= */

import { useStore } from './store/useStore.js';
import { build } from './graph/build.js';
import {
  exportAIData, aiPromptText, importAINotes, notePromptFor, clearNotes, notesState,
} from './notes/index.js';
import { exportSession, importSession, sessionData, dbgSnapshot } from './export/index.js';

/**
 * @param {object} deps {flowApi: React ref của FlowView, rebuild}
 * @returns {object} đối tượng đã gắn vào window.__pcode
 */
export function installPcodeApi(deps = {}) {
  const api = {
    /* --- view --- */
    setView: (scale, x, y) => deps.flowApi?.current?.setView?.({ x, y, zoom: scale }),
    getState: () => {
      const v = deps.flowApi?.current?.getView?.() || { x: 0, y: 0, zoom: 1 };
      const s = useStore.getState();
      return { scale: v.zoom, tx: v.x, ty: v.y, nodes: s.graphData ? s.graphData.nodes.length : 0 };
    },
    build: (keepView) => (deps.rebuild ? deps.rebuild(!!keepView) : build(!!keepView, {})),
    fitView: () => deps.flowApi?.current?.fitView?.(),
    centerNode: (nid) => deps.flowApi?.current?.centerNode?.(nid),
    dbgSnapshot: () => dbgSnapshot(deps.flowApi?.current?.getView?.()),

    /* --- AI notes (hook test + automation) --- */
    exportAI: (redact) => exportAIData(!!redact),
    aiPrompt: (redact) => aiPromptText(!!redact),
    // Bản cũ: import xong (mode → full) gọi renderGraph(keepView) để dự trù ô note
    // ngay; build() hiện đã tự tính noteReserve nên chỉ cần rebuild khi import OK.
    importAINotes: (text) => {
      const r = importAINotes(text);
      if (r && r.ok && typeof deps.rebuild === 'function') deps.rebuild(true);
      return r;
    },
    notePromptFor: (ref, purpose) => notePromptFor(ref, purpose),
    clearNotes: () => clearNotes(true),
    notesState: () => notesState(),

    /* --- session --- */
    sessionData: () => sessionData(),
    exportSession: () => exportSession(),
    importSession: (json) => importSession(json, deps.rebuild),
  };
  if (typeof window !== 'undefined') window.__pcode = api;
  return api;
}

/** Danh sách tên hàm bắt buộc — SPEC §8.3 liệt kê ĐÚNG 15 hàm (D10).
 *  Test khoá lại để không rơi rụng khi refactor. */
export const PCODE_API_NAMES = [
  'setView', 'getState', 'build', 'fitView', 'centerNode', 'dbgSnapshot',
  'exportAI', 'aiPrompt', 'importAINotes', 'notePromptFor', 'clearNotes', 'notesState',
  'sessionData', 'exportSession', 'importSession',
];
