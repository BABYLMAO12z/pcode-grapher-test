/* =========================================================================
 * PCODE Grapher · src/export/index.js — export SVG / PNG / session / debug (F9, F10)
 * Port js/ui/exporter.js (download/exportSVGFile/exportPNG) + phần session của
 * main.js.
 *  - exportPNG()      — rasterize SVG tự chứa qua canvas (GIỮ NGUYÊN cách bản
 *    cũ): nét chữ sắc, cap 8192px, scale 2×, không phụ thuộc DOM đang hiển thị.
 *  - exportPNGView()  — html-to-image (SPEC §2/D-export): chụp ĐÚNG những gì
 *    đang thấy trên màn hình, kể cả ô note/card/badge vốn là DOM của React Flow
 *    và không có trong SVG dựng tay.
 * ========================================================================= */

import { useStore } from '../store/useStore.js';
import { buildExportSVG } from './svg.js';
import { PRESETS } from '../graph/constants.js';
import { dropSavedNotesForCurrentSource } from '../notes/index.js';
import { applyHighlights } from '../ui/highlight.js';
import { lex } from '../core/lexer.js';
import { parseFunction } from '../core/parser.js';
import { CfgBuilder } from '../core/cfg.js';

export * from './svg.js';

export const PNG_MAX_PX = 8192;
export const PNG_SCALE = 2;

/** Tải blob về máy (port download()). */
export function download(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return a;
}

/** Gom ctx cho buildExportSVG từ store (positions/sizes lấy từ node React Flow). */
export function exportContext() {
  const s = useStore.getState();
  const positions = {}, sizes = {};
  for (const n of s.rfNodes) {
    if (!n.data || !n.data.cfgNode) continue;
    const id = n.data.cfgNode.id;
    positions[id] = { x: n.position.x, y: n.position.y };
    sizes[id] = {
      width: n.width || (n.measured && n.measured.width) || 220,
      height: n.height || (n.measured && n.measured.height) || 60,
    };
  }
  // L4: route ELK đã snap (edge data.points) — SVG export vẽ ĐÚNG đường đang
  // thấy trên màn hình thay vì tự dựng bezier tâm-tâm (đè nhau/xuyên block).
  const routes = {};
  for (const e of s.rfEdges) {
    if (e.type !== 'cfg' || !e.data) continue;
    if (e.data.idx != null && e.data.points && e.data.points.length >= 2) {
      routes[e.data.idx] = e.data.points;
    }
  }
  return {
    graphData: s.graphData, positions, sizes, theme: s.theme,
    expanded: s.expanded, nodeRefMap: s.nodeRefMap, rankdir: s.opts.rankdir,
    routes,
  };
}

export function exportSVGString() {
  const ctx = exportContext();
  if (!ctx.graphData || !ctx.graphData.nodes.length) return null;
  return buildExportSVG(ctx);
}

export function exportSVGFile() {
  const svg = exportSVGString();
  if (svg == null) return null;
  download('pcode-graph.svg', new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  useStore.getState().toast('Đã export SVG');
  return svg;
}

/** Tỉ lệ PNG: 2× nhưng không vượt 8192px mỗi chiều (port nhánh cap của exportPNG). */
export function pngScaleFor(w, h, maxPx = PNG_MAX_PX, want = PNG_SCALE) {
  if (w * want > maxPx || h * want > maxPx) return Math.min(maxPx / w, maxPx / h, want);
  return want;
}

/** Rasterize SVG → PNG (Promise<Blob|null>). */
export function exportPNG() {
  const svgStr = exportSVGString();
  const toast = useStore.getState().toast;
  if (svgStr == null) return Promise.resolve(null);
  const isLight = useStore.getState().theme === 'light';
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas');
      const w = img.width, h = img.height;
      const scale = pngScaleFor(w, h);
      cv.width = Math.floor(w * scale);
      cv.height = Math.floor(h * scale);
      const ctx = cv.getContext('2d');
      ctx.scale(scale, scale);
      ctx.fillStyle = isLight ? '#f6f8fa' : '#0d1117';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0);
      cv.toBlob((b) => {
        if (b) { download('pcode-graph.png', b); toast('Đã export PNG'); }
        resolve(b || null);
      }, 'image/png');
    };
    img.onerror = () => {
      toast('Export PNG lỗi trên trình duyệt này — hãy thử SVG');
      resolve(null);
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
  });
}

/**
 * Chụp PNG ĐÚNG như màn hình (gồm ô note, card, badge) bằng html-to-image.
 * Dùng khi người dùng muốn ảnh y hệt khung nhìn; muốn nét vector thì dùng SVG.
 * @returns {Promise<string|null>} dataURL
 */
export async function exportPNGView(el) {
  const toast = useStore.getState().toast;
  const target = el || document.querySelector('.react-flow__viewport');
  if (!target) { toast('Chưa có graph để chụp'); return null; }
  try {
    const { toPng } = await import('html-to-image');
    const isLight = useStore.getState().theme === 'light';
    const rect = target.getBoundingClientRect();
    const scale = pngScaleFor(Math.max(1, rect.width), Math.max(1, rect.height));
    const dataUrl = await toPng(target, {
      backgroundColor: isLight ? '#f6f8fa' : '#0d1117',
      pixelRatio: scale,
      cacheBust: true,
    });
    const blob = await (await fetch(dataUrl)).blob();
    download('pcode-graph-view.png', blob);
    toast('Đã export PNG (đúng khung nhìn)');
    return dataUrl;
  } catch (e) {
    toast('Không chụp được khung nhìn: ' + (e && e.message) + ' — hãy thử ⤓ SVG');
    return null;
  }
}

/* ------------------------------ session --------------------------------- */

export function sessionData() {
  return useStore.getState().sessionState();
}

export function exportSession() {
  const data = sessionData();
  download('pcode-session.json', new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  useStore.getState().toast('Đã export session');
  return data;
}

/**
 * Nạp session (port importSession). notes gán TRƯỚC build để hook re-anchor;
 * `notes: null` → xoá cả bản lưu của nguồn này cho nhất quán.
 * @param {string|object} json
 * @param {function} rebuild build(false) của app
 */
export async function importSession(json, rebuild) {
  const toast = useStore.getState().toast;
  try {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    if (!data || typeof data !== 'object') throw new Error('không phải object JSON');
    if (data.preset && !PRESETS[data.preset]) delete data.preset;
    const hadNotesKey = data.notes !== undefined;
    useStore.getState().applySessionState(data);
    if (hadNotesKey && !useStore.getState().notes) {
      useStore.setState({ openNoteKey: null, openNoteAnchor: null, mainPathOn: false });
      dropSavedNotesForCurrentSource();
    }
    if (rebuild) await rebuild(false);
    // FIX(25b): hlKeys vừa nhập phải được TÍNH LẠI thành lit/dimmed/hlOrder trên
    // graph mới, nếu không session lưu lúc đang tìm kiếm mở ra không sáng gì.
    if (useStore.getState().hlKeys.size) { try { applyHighlights(); } catch { /* nt */ } }
    toast('Đã import session');
    return true;
  } catch (e) {
    toast('Lỗi import session: ' + e.message);
    return false;
  }
}

/* ------------------------------- debug ---------------------------------- */

/** Ảnh chụp trạng thái để gửi dev (port dbgSnapshot của js/ui/debug.js). */
export function dbgSnapshot(view = {}) {
  const s = useStore.getState();
  return {
    ua: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    dpr: typeof window !== 'undefined' ? window.devicePixelRatio : 1,
    viewport: typeof window !== 'undefined' ? { w: window.innerWidth, h: window.innerHeight } : { w: 0, h: 0 },
    tf: { tx: +(view.x || 0).toFixed(2), ty: +(view.y || 0).toFixed(2), scale: +(view.zoom || 1).toFixed(4) },
    flags: {
      safemode: s.ui.safeMode,
      notesMode: s.notesMode,
      mainPathOn: s.mainPathOn,
      hlKeys: [...s.hlKeys],
    },
    graph: {
      nodes: s.graphData ? s.graphData.nodes.length : 0,
      edges: s.graphData ? s.graphData.edges.length : 0,
      rankdir: s.opts.rankdir,
      preset: s.opts.preset,
    },
    ghidra: { connected: s.ghdr.connected, program: s.ghdr.program, symbols: Object.keys(s.ghdr.symByText).length },
    notes: s.notes && s.notes.match ? s.notes.match.counts : null,
    events: s.ui.dbgLog.slice(-40),
  };
}

/**
 * 🐛 Export Debug — PORT ĐẦY ĐỦ exportDebugData() của main.js cũ (v2 trước chỉ
 * export dbgSnapshot của HUD, mất hẳn phần dump tokens + AST + CFG + adjacency
 * vốn là lý do nút này tồn tại: "Gửi file này cho dev để debug").
 */
export function exportDebugData(view) {
  const st = useStore.getState();
  const code = st.src;
  if (!code.trim()) {
    st.toast('Paste pseudocode trước khi export debug');
    return null;
  }

  // Parse dựng lại độc lập với graph đang vẽ (như bản cũ)
  let tokens = [];
  let parsed = null;
  let cfg = null;
  let parseErrors = [];
  let cfgWarnings = [];

  try {
    tokens = lex(code);
  } catch (e) {
    parseErrors.push('Lexer error: ' + e.message);
  }
  try {
    parsed = parseFunction(tokens);
    parseErrors = parseErrors.concat(parsed.errors || []);
  } catch (e) {
    parseErrors.push('Parser error: ' + e.message);
  }
  if (parsed) {
    try {
      cfg = new CfgBuilder().build(parsed);
      cfgWarnings = cfg.warnings || [];
    } catch (e) {
      parseErrors.push('CFG error: ' + e.message);
    }
  }

  const debug = {
    _meta: {
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      description: 'PCODE Grapher Debug Export - Gửi file này cho dev để debug',
    },
    source: {
      code,
      lines: code.split('\n').length,
    },
    tokens: {
      count: tokens.length,
      list: tokens.map((t, i) => ({
        index: i,
        type: t.t,
        value: t.v,
        // Thêm context: 3 tokens trước và sau
        context: tokens.slice(Math.max(0, i - 3), i + 4).map((x) => x.v).join(' '),
      })),
    },
    ast: parsed
      ? {
          header: parsed.header ? parsed.header.map((t) => t.v).join(' ') : null,
          bodyStatements: parsed.body.length,
          body: parsed.body.map((s, i) => ({
            index: i,
            kind: s.k,
            // Chi tiết theo loại statement (port nguyên văn bản cũ)
            ...(s.k === 'if'
              ? {
                  condition: s.cond.map((t) => t.v).join(''),
                  thenStatements: s.then.length,
                  elseStatements: s.els ? (Array.isArray(s.els) ? s.els.length : 1) : 0,
                  elseKind: s.els ? s.els.k : null,
                }
              : {}),
            ...(s.k === 'while' || s.k === 'dowhile'
              ? {
                  condition: s.cond.map((t) => t.v).join(''),
                  bodyStatements: s.body.length,
                }
              : {}),
            ...(s.k === 'for'
              ? {
                  init: s.init.map((t) => t.v).join(''),
                  condition: s.cond.map((t) => t.v).join(''),
                  increment: s.incr.map((t) => t.v).join(''),
                  bodyStatements: s.body.length,
                }
              : {}),
            ...(s.k === 'switch'
              ? {
                  expression: s.expr.map((t) => t.v).join(''),
                  cases: s.cases.length,
                }
              : {}),
            ...(s.k === 'raw' ? { tokens: s.toks.map((t) => t.v).join('') } : {}),
            ...(s.k === 'goto' ? { target: s.name } : {}),
            ...(s.k === 'label' ? { name: s.name } : {}),
            ...(s.k === 'return' || s.k === 'break' || s.k === 'continue'
              ? { tokens: (s.toks || []).map((t) => t.v).join('') }
              : {}),
          })),
          extras: parsed.extras ? parsed.extras.length : 0,
        }
      : null,
    cfg: cfg
      ? {
          nodesCount: cfg.nodes.length,
          edgesCount: cfg.edges.length,
          nodes: cfg.nodes.map((n) => ({
            id: n.id,
            kind: n.kind,
            ctag: n.ctag || null,
            flags: n.flags,
            linesCount: n.lines.length,
            lines: n.lines.map((l) => {
              if (l.comment) return { type: 'comment', text: l.comment };
              if (l.text) return { type: 'label', text: l.text };
              return {
                type: 'code',
                tokens: l.toks ? l.toks.map((t) => t.v).join('') : '',
                semi: l.semi || false,
              };
            }),
          })),
          edges: cfg.edges.map((e) => ({
            from: e.from,
            to: e.to,
            kind: e.kind,
            label: e.elabel || null,
          })),
          warnings: cfgWarnings,
        }
      : null,
    errors: {
      parseErrors,
      cfgWarnings,
      total: parseErrors.length + cfgWarnings.length,
    },
    // Thêm adjacency list để dễ debug
    adjacency: cfg
      ? (() => {
          const adj = {};
          for (const n of cfg.nodes) adj[n.id] = { incoming: [], outgoing: [] };
          for (const e of cfg.edges) {
            if (adj[e.from]) adj[e.from].outgoing.push({ to: e.to, kind: e.kind, label: e.elabel });
            if (adj[e.to]) adj[e.to].incoming.push({ from: e.from, kind: e.kind, label: e.elabel });
          }
          return adj;
        })()
      : null,
    // snapshot view hiện tại (v2 bổ sung: viewport để dev thấy đúng trạng thái hiển thị)
    view: view || null,
  };

  download(
    'pcode-debug-' + Date.now() + '.json',
    new Blob([JSON.stringify(debug, null, 2)], { type: 'application/json' })
  );
  st.toast(
    'Đã export debug data (' + tokens.length + ' tokens, ' +
      (cfg ? cfg.nodes.length : 0) + ' nodes)'
  );
  return debug;
}
