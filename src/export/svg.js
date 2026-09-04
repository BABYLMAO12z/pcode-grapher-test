/* =========================================================================
 * PCODE Grapher · src/export/svg.js — PORT NGUYÊN VĂN buildExportSVG (F9)
 *
 * Dựng SVG tự chứa: node vẽ bằng <rect> + <text>/<tspan> (KHÔNG <foreignObject>
 * — gây PNG trống khi rasterize), cạnh lấy path đã route sẵn.
 *
 * Khác bản cũ DUY NHẤT ở nguồn dữ liệu: `nodeEls[id].style.left/offsetWidth`
 * → positions/sizes của layout trong store; `$('#edges').innerHTML` → dựng lại
 * path từ toạ độ node (React Flow không giữ SVG string). Bảng màu, hằng số
 * FONT/PADX/BASE/LH, nền, marker, quy tắc gập dòng: GIỮ NGUYÊN.
 * ========================================================================= */

import * as PcodeCore from '../core/index.js';
import { needSpace } from '../ui/tokens.js';
import { EDGE_PALETTES, collapsibleBlock, HEAD_L, TAIL_L } from '../graph/constants.js';
import { roundedOrthPath, polylineMidpoint } from '../graph/CfgEdge.jsx';
import { isEntryNode } from '../core/cfg.js';
import { LN_H } from '../graph/constants.js';
import { routeAvoidingBlocks, polylineHitsRects } from '../graph/astarRoute.js';

/** esc HTML/XML (port esc() của tokens.js cũ). */
export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** id marker an toàn từ mã màu (port cssColorId). */
export function cssColorId(c) {
  return String(c).replace(/[^a-zA-Z0-9]/g, '');
}

export const EXPORT_CSS_LIGHT = `
  .edge{fill:none;stroke-width:1.7;}
  .edge.dashed{stroke-dasharray:6 4;}
  .edge.loop{stroke-dasharray:8 4;stroke-width:1.5;}
  .elbl{font:10px ui-monospace,monospace;font-weight:bold;paint-order:stroke;stroke:#f6f8fa;stroke-width:1.5px;}
`;
export const EXPORT_CSS_DARK = `
  .edge{fill:none;stroke-width:1.7;}
  .edge.dashed{stroke-dasharray:6 4;}
  .edge.loop{stroke-dasharray:8 4;stroke-width:1.5;}
  .elbl{font:10px ui-monospace,monospace;font-weight:bold;paint-order:stroke;stroke:#01020e;stroke-width:1.5px;}
`;

/** Màu token khi xuất SVG — PHẢI khớp --syn-* của app.css (dark + light).
 * v5 dark: kw rose · ty azure · fn lavender · num gold · addr teal · var sky-teal. */
export const TK_COLORS = {
  kw: '#ff6b7a', ty: '#5eb1ff', fn: '#b794f6', gop: '#e6c07b', num: '#e0b43c',
  str: '#3dd9a8', com: '#6b7c8f', addr: '#2ecfc0', const: '#d4c091', op: '#9aabbc', lbl: '#e0b43c',
};
export const TK_COLORS_LIGHT = {
  kw: '#c61050', ty: '#0550ae', fn: '#6e40c9', gop: '#ad4500', num: '#8a5a00',
  str: '#0a7655', com: '#6e7781', addr: '#0e7490', const: '#8a5a00', op: '#1f2328', lbl: '#8a5a00',
};

export function tokenColor(toks, i, isLight) {
  const pal = isLight ? TK_COLORS_LIGHT : TK_COLORS;
  const tk = toks[i];
  if (tk.t === 'com') return pal.com;
  if (tk.t === 'str') return pal.str;
  if (tk.t === 'num') return pal.num;
  if (tk.t === 'id') {
    const cls = PcodeCore.classifyId(toks, i);
    return cls === 'var' ? PcodeCore.varColor(tk.v) : pal[cls] || pal.op;
  }
  return pal.op;
}

/** Một dòng → chuỗi <tspan> có màu (port lineSvg). */
export function lineSvg(line, isLight) {
  const pal = isLight ? TK_COLORS_LIGHT : TK_COLORS;
  if (line.comment !== undefined) return '<tspan fill="' + pal.com + '">' + esc(line.comment) + '</tspan>';
  if (line.text !== undefined) return '<tspan fill="' + pal.lbl + '">' + esc(line.text) + '</tspan>';
  let s = '', pp = null, prev = null;
  const toks = line.toks || [];
  for (let i = 0; i < toks.length; i++) {
    const tk = toks[i];
    const sp = needSpace(pp, prev, tk) ? ' ' : '';
    s += '<tspan fill="' + tokenColor(toks, i, isLight) + '">' + esc(sp + tk.v) + '</tspan>';
    pp = prev;
    prev = tk;
  }
  if (line.semi) s += '<tspan fill="' + pal.op + '">;</tspan>';
  return s;
}

/** Viền/nền rect theo loại block (port nodeRectStyle) — đồng bộ .node CSS. */
export function nodeRectStyle(n, isLight) {
  // v5.1: entry KHÔNG còn dashed/accent fill — cùng stroke block thường
  // (marker "in" + vạch trái chỉ trên DOM; SVG dùng vạch trái riêng bên dưới)
  let fill = isLight ? '#ffffff' : '#121820';
  let stroke = isLight ? '#c3ccd6' : '#2c3a4e';
  let rx = 8, dash = '';
  if (n.kind === 'cond') stroke = isLight ? '#6e90c4' : '#3a6a9a';
  else if (n.kind === 'label') { stroke = isLight ? '#a08600' : '#9a8440'; rx = 12; }
  // terminal / tail: gạch đáy trung tính / accent dịu — không đổi stroke cả khung
  if (n.flags && n.flags.terminal) stroke = isLight ? '#8a94a1' : '#3a4a5c';
  else if (n.flags && n.flags.tail) stroke = isLight ? '#0969da' : '#3d5a7a';
  return { fill, stroke, rx, dash, entry: isEntryNode(n) };
}

/**
 * Dòng THỰC SỰ nhìn thấy trong box — block đang gập thì export cũng phải gập,
 * nếu không chữ tràn ra ngoài rect (port visibleLinesOf).
 */
export function visibleLinesOf(n, expanded) {
  const tot = n.lines.length;
  if (collapsibleBlock(n) && !(expanded || {})[n.id]) {
    return n.lines.slice(0, HEAD_L)
      .concat([{ text: '… đang ẩn ' + (tot - HEAD_L - TAIL_L) + ' dòng — bấm ▾ trên sơ đồ để mở' }])
      .concat(n.lines.slice(tot - TAIL_L));
  }
  return n.lines;
}

/** Khung bao graph + padding 24 (port getGraphBounds). */
export function getGraphBounds(graphData, positions, sizes) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of (graphData && graphData.nodes) || []) {
    const p = positions[n.id];
    const s = sizes[n.id];
    if (!p || !s) continue;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + s.width);
    maxY = Math.max(maxY, p.y + s.height);
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 800, height: 600 };
  return { x: minX - 24, y: minY - 24, width: maxX - minX + 48, height: maxY - minY + 48 };
}

/** Path cạnh fallback (không có route ELK): bezier dọc/ngang như RF, có offset
 *  tách edge song song (L4 — khớp fallback smoothstep của CfgEdge). */
function edgePath(a, b, sa, sb, rankdir, off = 0) {
  if (rankdir === 'LR') {
    const x1 = a.x + sa.width, y1 = a.y + sa.height / 2 + off;
    const x2 = b.x, y2 = b.y + sb.height / 2 + off;
    const dx = Math.max(24, Math.abs(x2 - x1) / 2);
    return 'M' + x1.toFixed(1) + ',' + y1.toFixed(1) +
      ' C' + (x1 + dx).toFixed(1) + ',' + y1.toFixed(1) +
      ' ' + (x2 - dx).toFixed(1) + ',' + y2.toFixed(1) +
      ' ' + x2.toFixed(1) + ',' + y2.toFixed(1);
  }
  const x1 = a.x + sa.width / 2 + off, y1 = a.y + sa.height;
  const x2 = b.x + sb.width / 2 + off, y2 = b.y;
  const dy = Math.max(18, Math.abs(y2 - y1) / 2);
  return 'M' + x1.toFixed(1) + ',' + y1.toFixed(1) +
    ' C' + x1.toFixed(1) + ',' + (y1 + dy).toFixed(1) +
    ' ' + x2.toFixed(1) + ',' + (y2 - dy).toFixed(1) +
    ' ' + x2.toFixed(1) + ',' + y2.toFixed(1);
}

/** Self-loop (do-while thân rỗng/while(1)): cung y hệt CfgEdge trên màn hình. */
function selfLoopPath(a, sa, rankdir) {
  const bow = 46;
  // handle như RF: TB = đáy-giữa → đỉnh-giữa; LR = phải-giữa → trái-giữa
  const sx = rankdir === 'LR' ? a.x + sa.width : a.x + sa.width / 2;
  const sy = rankdir === 'LR' ? a.y + sa.height / 2 : a.y + sa.height;
  const tx = rankdir === 'LR' ? a.x : a.x + sa.width / 2;
  const ty = rankdir === 'LR' ? a.y + sa.height / 2 : a.y;
  return 'M ' + sx.toFixed(1) + ',' + sy.toFixed(1) +
    ' C ' + (sx + bow).toFixed(1) + ',' + (sy + 30).toFixed(1) +
    ' ' + (tx + bow).toFixed(1) + ',' + (ty - 30).toFixed(1) +
    ' ' + tx.toFixed(1) + ',' + ty.toFixed(1);
}

/** Điểm p nằm trong/lân cận rect (tol px)? — route còn hợp lệ với vị trí node. */
function nearRect(p, x, y, w, h, tol) {
  return p.x >= x - tol && p.x <= x + w + tol && p.y >= y - tol && p.y <= y + h + tol;
}

/**
 * @param {object} ctx {graphData, positions, sizes, theme, expanded, nodeRefMap, rankdir}
 * @returns {string} SVG tự chứa
 */
export function buildExportSVG(ctx) {
  const {
    graphData, positions = {}, sizes = {}, theme = 'dark',
    expanded = {}, nodeRefMap = {}, rankdir = 'TB', routes = {},
  } = ctx || {};
  const isLight = theme === 'light';
  const bg = isLight ? '#f6f8fa' : '#01020e';
  const css = isLight ? EXPORT_CSS_LIGHT : EXPORT_CSS_DARK;
  const pal = EDGE_PALETTES[isLight ? 'light' : 'dark'];
  const bounds = getGraphBounds(graphData, positions, sizes);
  const gw = bounds.width, gh = bounds.height;

  let s = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<svg xmlns="http://www.w3.org/2000/svg" ' +
    'width="' + gw + '" height="' + gh + '" viewBox="' + bounds.x + ' ' + bounds.y + ' ' + gw + ' ' + gh + '">' +
    '<style>' + css.replace(/</g, '&lt;') + '</style>' +
    '<rect x="' + bounds.x + '" y="' + bounds.y + '" width="100%" height="100%" fill="' + bg + '"/>';

  let defs = '<defs>';
  const cols = new Set(Object.values(pal).map((x) => x.col));
  for (const c of cols) {
    defs += '<marker id="arr-' + cssColorId(c) + '" viewBox="0 0 10 10" refX="9" refY="5" ' +
      'markerWidth="7" markerHeight="7" orient="auto-start-reverse">' +
      '<path d="M0,0 L10,5 L0,10 z" fill="' + c + '"/></marker>';
  }
  defs += '</defs>';
  s += defs;

  /* --- cạnh: path + nhãn --- */
  // L4: nhóm edge song song cùng (from,to) để offset fallback như CfgEdge
  const allEdges = (graphData && graphData.edges) || [];
  /* FIX(22): nhóm theo CẶP KHÔNG HƯỚNG y như toFlowGraph/CfgEdge. Bản cũ khoá
   * 'from>to' nên hai edge NGƯỢC CHIỀU cùng cặp block (vòng lặp goto lên/xuống)
   * mỗi cái là một nhóm 1 phần tử → off = 0 → hai đường CHỒNG KHÍT trong file
   * SVG dù trên màn hình chúng tách nhau. */
  const pgroup = {};
  const pkey = (e) => (e.from <= e.to ? e.from + '|' + e.to : e.to + '|' + e.from);
  allEdges.forEach((e, i) => {
    const k = pkey(e);
    (pgroup[k] = pgroup[k] || []).push(i);
  });
  /* Vật cản = mọi block, để kiểm tra route ELK có bị block khác (bị kéo tay) đè
   * lên không — CfgEdge trên màn hình chuyển sang A* trong trường hợp đó. */
  const allRects = [];
  for (const n of (graphData && graphData.nodes) || []) {
    const p = positions[n.id], sz = sizes[n.id];
    if (p && sz) allRects.push({ id: n.id, x: p.x, y: p.y, w: sz.width, h: sz.height });
  }
  for (let i = 0; i < allEdges.length; i++) {
    const e = allEdges[i];
    const a = positions[e.from], b = positions[e.to];
    const sa = sizes[e.from], sb = sizes[e.to];
    if (!a || !b || !sa || !sb) continue;
    const sty = pal[e.kind] || pal.plain;
    // Bản 1.9.3 (graph.js + exporter.js): 'dashed' CHỈ cho case; 'false' liền đỏ;
    // 'loop' dash riêng (CSS .edge.loop 8 4). Trước đây v2 gắn nhầm cả false.
    const cls = 'edge' + (e.kind === 'loop' ? ' loop' : '') +
      (e.kind === 'case' ? ' dashed' : '');

    // 1) route ELK còn khớp vị trí node hiện tại → vẽ đúng đường trên màn hình
    let d = null, lx = null, ly = null;
    const pts = routes[i];
    // FIX(23): route ELK chỉ dùng được khi 2 đầu CÒN bám block VÀ không bị block
    // khác đè lên — đúng điều kiện anchorsOk của CfgEdge. Thiếu vế sau thì file
    // SVG vẽ đường xuyên qua block trong khi màn hình đã đổi sang A*.
    const others = allRects.filter((r) => r.id !== e.from && r.id !== e.to);
    if (pts && pts.length >= 2 &&
        nearRect(pts[0], a.x, a.y, sa.width, sa.height, 12) &&
        nearRect(pts[pts.length - 1], b.x, b.y, sb.width, sb.height, 12) &&
        !polylineHitsRects(pts, others)) {
      d = roundedOrthPath(pts, 8);
      const mid = polylineMidpoint(pts);
      lx = mid.x; ly = mid.y;
    } else if (e.from === e.to) {
      // 2) self-loop: cung riêng (bezier tâm-tâm cũ suy biến xuyên block)
      d = selfLoopPath(a, sa, rankdir);
      const sx0 = rankdir === 'LR' ? a.x + sa.width : a.x + sa.width / 2;
      lx = sx0 + 46 * 0.75;
      ly = rankdir === 'LR' ? a.y + sa.height / 2 : a.y + sa.height / 2;
    } else {
      // 3) fallback: A* tránh block (giống CfgEdge), bí đường mới dùng bezier
      const grp = pgroup[pkey(e)] || [i];
      const pidx = grp.indexOf(i), pcount = grp.length;
      let off = pcount > 1 ? (pidx - (pcount - 1) / 2) * 14 : 0;
      off = Math.max(-21, Math.min(21, off));
      const A = rankdir === 'LR'
        ? { x: a.x + sa.width, y: a.y + sa.height / 2 + off }
        : { x: a.x + sa.width / 2 + off, y: a.y + sa.height };
      const Bp = rankdir === 'LR'
        ? { x: b.x, y: b.y + sb.height / 2 + off }
        : { x: b.x + sb.width / 2 + off, y: b.y };
      let astar = null;
      try { astar = routeAvoidingBlocks(A, Bp, others); } catch { /* nt */ }
      if (astar) {
        d = roundedOrthPath(astar, 8);
        const mid = polylineMidpoint(astar);
        lx = mid.x; ly = mid.y;
      } else {
        d = edgePath(a, b, sa, sb, rankdir, off);
        lx = (a.x + sa.width / 2 + b.x + sb.width / 2) / 2 + (rankdir === 'LR' ? 0 : off);
        ly = (a.y + sa.height + b.y) / 2 + (rankdir === 'LR' ? off : 0);
      }
    }

    s += '<path class="' + cls + '" d="' + d + '" stroke="' + sty.col +
      '" marker-end="url(#arr-' + cssColorId(sty.col) + ')"/>';
    const label = e.elabel || sty.label || '';
    if (label) {
      s += '<text class="elbl" x="' + lx.toFixed(1) + '" y="' + ly.toFixed(1) +
        '" text-anchor="middle" fill="' + sty.col + '">' + esc(label) + '</text>';
    }
  }

  /* --- node: rect + text --- */
  const FONT = 'font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="12.5"';
  // FIX(35b): bước dòng trong SVG phải TRÙNG --ln-h của app (19px), nếu không
  // chữ trong file export trôi dần so với khung rect (block 44 dòng lệch ~22px)
  // và ảnh xuất ra khác hẳn màn hình.
  const PADX = 11, BASE = 12, LH = LN_H;
  const txtFill = isLight ? '#1f2328' : '#c8d1dc';
  const tagFill = isLight ? '#656d76' : '#7d8b9c';
  for (const n of (graphData && graphData.nodes) || []) {
    const p = positions[n.id], sz = sizes[n.id];
    if (!p || !sz) continue;
    const x = p.x, y = p.y, w = sz.width + 2, h = sz.height + 2;
    const rc = nodeRectStyle(n, isLight);
    s += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + rc.rx +
      '" fill="' + rc.fill + '" stroke="' + rc.stroke + '" stroke-width="1"' + rc.dash + '/>';
    // v5.1: entry = vạch trái 3px accent (parity CSS inset), không dashed khung
    if (rc.entry) {
      const em = isLight ? '#0969da' : '#4d7cff';
      s += '<rect x="' + x + '" y="' + (y + 1) + '" width="3" height="' + Math.max(0, h - 2) +
        '" fill="' + em + '" rx="1"/>';
    }
    const tag = (nodeRefMap[n.id] || '#' + n.id) + (isEntryNode(n) ? ' in' : '');
    s += '<text x="' + (x + w - 6) + '" y="' + (y - 2) + '" text-anchor="end" font-size="9" fill="' +
      tagFill + '">' + esc(tag) + '</text>';
    let li = 0;
    const seqBg = n.lines.some((l) => l.ctl);
    for (const ln of visibleLinesOf(n, expanded)) {
      const lnY = y + 8 + li * LH;
      if (ln.ctl) {
        s += '<rect x="' + x + '" y="' + lnY.toFixed(1) + '" width="' + w + '" height="' + LH +
          '" fill="' + (isLight ? 'rgba(9,105,218,0.10)' : 'rgba(45,140,255,0.14)') + '"/>';
        s += '<rect x="' + x + '" y="' + lnY.toFixed(1) + '" width="3" height="' + LH +
          '" fill="' + (isLight ? '#0550ae' : '#3d9bff') + '"/>';
      } else if (seqBg && ln.comment === undefined && ln.text === undefined) {
        s += '<rect x="' + x + '" y="' + lnY.toFixed(1) + '" width="' + w + '" height="' + LH +
          '" fill="' + (isLight ? 'rgba(9,105,218,0.05)' : 'rgba(77,124,255,0.07)') + '"/>';
        s += '<rect x="' + x + '" y="' + lnY.toFixed(1) + '" width="3" height="' + LH +
          '" fill="' + (isLight ? '#0969da' : '#4d7cff') + '"/>';
      }
      s += '<text x="' + (x + PADX) + '" y="' + (y + BASE + li * LH).toFixed(1) + '" ' + FONT +
        ' fill="' + txtFill + '">' + lineSvg(ln, isLight) + '</text>';
      li++;
    }
  }
  s += '</svg>';
  return s;
}
