/* =========================================================================
 * PCODE Grapher · src/graph/CfgEdge.jsx — custom edge React Flow
 * Thay phần vẽ SVG thủ công của graph.js: màu theo EDGE_PALETTES[theme][kind],
 * nhãn T / F / ↺ / goto … / case … , nét đứt cho case, tô đậm khi focus/lit.
 *
 * Đường vẽ (A1/A2/A3):
 *   1. data.points (route ELK đã snap) → path vuông góc bo góc, KHÔNG cắt node
 *      — chỉ dùng khi 2 đầu vẫn khớp điểm neo lúc layout (node chưa bị kéo).
 *   2. Fallback smoothstep: edge song song cùng cặp node tách nhau bằng offset
 *      (pidx/pcount), self-loop vẽ cung riêng — không bao giờ trùng khít 100%.
 * ========================================================================= */

import { memo } from 'react';
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from '@xyflow/react';
import { EDGE_PALETTES } from './constants.js';
import { useStore } from '../store/useStore.js';
import { routeAvoidingBlocks, polylineHitsRects } from './astarRoute.js';

/** Node kéo tay lệch quá ngưỡng này (px) so với điểm neo lúc layout → route
 *  ELK coi như lỗi thời. Handle của RF nằm nhô ~2-4px ngoài biên nên cần nới. */
export const ROUTE_ANCHOR_TOL = 10;

const R2 = (v) => Math.round(v * 100) / 100;

/** Polyline vuông góc → path SVG bo góc bán kính r (port roundPath cũ). */
export function roundedOrthPath(pts, r = 8) {
  if (!pts || pts.length < 2) return '';
  let d = 'M' + R2(pts[0].x) + ',' + R2(pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1];
    const inLen = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const outLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const rr = Math.min(r, inLen / 2, outLen / 2);
    if (rr < 0.75 || !inLen || !outLen) {
      d += ' L' + R2(p1.x) + ',' + R2(p1.y);
      continue;
    }
    const ix = (p1.x - p0.x) / inLen, iy = (p1.y - p0.y) / inLen;
    const ox = (p2.x - p1.x) / outLen, oy = (p2.y - p1.y) / outLen;
    d += ' L' + R2(p1.x - ix * rr) + ',' + R2(p1.y - iy * rr);
    d += ' Q' + R2(p1.x) + ',' + R2(p1.y) + ' ' + R2(p1.x + ox * rr) + ',' + R2(p1.y + oy * rr);
  }
  const last = pts[pts.length - 1];
  d += ' L' + R2(last.x) + ',' + R2(last.y);
  return d;
}

/** Điểm giữa polyline THEO ĐỘ DÀI (đặt nhãn) — mỗi route một midpoint riêng
 *  nên nhãn 2 edge song song không còn chồng lên nhau. */
export function polylineMidpoint(pts) {
  if (!pts || !pts.length) return { x: 0, y: 0 };
  if (pts.length === 1) return { x: pts[0].x, y: pts[0].y };
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  let acc = 0;
  const half = total / 2;
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (acc + seg >= half && seg > 0) {
      const t = (half - acc) / seg;
      return {
        x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t,
        y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t,
      };
    }
    acc += seg;
  }
  return { x: pts[pts.length - 1].x, y: pts[pts.length - 1].y };
}

/** Nhãn hiển thị: elabel của CFG ưu tiên, không có thì nhãn mặc định theo kind. */
export function edgeLabelOf(kind, elabel, palette) {
  const sty = palette[kind] || palette.plain;
  // bản cũ: nhãn = e.elabel || sty.label NGUYÊN VĂN (goto edge vẫn chỉ "LAB_xxx")
  if (elabel) return elabel;
  return sty.label || '';
}

function CfgEdgeInner({
  id, source, target,
  sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data = {},
}) {
  // U10: subscribe vị trí node trong store — khi block KHÁC bị kéo đè lên
  // route cũ, props của edge này KHÔNG đổi nên memo bỏ qua re-render; không có
  // subscription này thì đường cũ (xuyên block) được vẽ mãi.
  useStore((s) => s.rfNodes);
  const { kind = 'plain', elabel = '', theme = 'dark', lit, dimmed, focus, mainPath, pl, noteState } = data;
  const palette = EDGE_PALETTES[theme === 'light' ? 'light' : 'dark'];
  const sty = palette[kind] || palette.plain;

  /* --- vật cản chung cho U10: mọi block cfg KHÁC (vị trí sống từ store —
   *     onNodesChange cập nhật liên tục trong lúc kéo) --- */
  let obstacles = null;
  try {
    obstacles = [];
    for (const n of useStore.getState().rfNodes) {
      if (n.type !== 'cfg' || n.id === source || n.id === target) continue;
      obstacles.push({ x: n.position.x, y: n.position.y, w: n.width || 200, h: n.height || 60 });
    }
  } catch { /* store chưa sẵn — không có vật cản để xét */ }

  /* --- 1) route ELK còn hợp lệ? (node chưa bị kéo khỏi vị trí layout)
   *     U10: kể cả khi 2 ĐẦU còn đúng neo, block khác có thể bị kéo rơi xuống
   *     ĐÈ lên route cũ → nếu polyline vướng vật cản thì cũng chuyển sang A*. --- */
  const pts = data.points;
  const anchorsOk = pts && pts.length >= 2 && data.sAnchor && data.tAnchor &&
    Math.hypot(sourceX - data.sAnchor.x, sourceY - data.sAnchor.y) <= ROUTE_ANCHOR_TOL &&
    Math.hypot(targetX - data.tAnchor.x, targetY - data.tAnchor.y) <= ROUTE_ANCHOR_TOL &&
    !(obstacles && obstacles.length && polylineHitsRects(pts, obstacles));

  let path, labelX, labelY;
  if (anchorsOk) {
    path = roundedOrthPath(pts, 8);
    const mid = polylineMidpoint(pts);
    labelX = mid.x;
    labelY = mid.y;
  } else if (source === target) {
    /* --- self-loop (while(x); …): cung tròn bên phải block --- */
    const bow = 46;
    path = `M ${R2(sourceX)},${R2(sourceY)} C ${R2(sourceX + bow)},${R2(sourceY + 30)} ` +
      `${R2(targetX + bow)},${R2(targetY - 30)} ${R2(targetX)},${R2(targetY)}`;
    labelX = Math.max(sourceX, targetX) + bow * 0.75;
    labelY = (sourceY + targetY) / 2;
  } else {
    /* --- 2) fallback: A* TRÁNH BLOCK (U10), chỉ smoothstep khi A* bí đường ---
     * Node đã kéo khỏi vị trí layout → route ELK lỗi thời. Trước đây
     * smoothstep vẽ thẳng_tuột xuyên qua block khác ("graph loạn"). Giờ lệch
     * offset pidx trên điểm neo (tách edge song song cùng cặp node). */
    const pcount = data.pcount || 1;
    const pidx = data.pidx || 0;
    const shift = Math.max(-24, Math.min(24, (pidx - (pcount - 1) / 2) * 12));
    // neo trượt DỌC THEO cạnh nó bám: top/bottom → lệch x, left/right → lệch y
    const slide = (pos) => ((pos === 'left' || pos === 'right')
      ? { x: 0, y: shift } : { x: shift, y: 0 });
    const so = slide(sourcePosition), to = slide(targetPosition);
    const A = { x: sourceX + so.x, y: sourceY + so.y };
    const B = { x: targetX + to.x, y: targetY + to.y };

    // vật cản đã tính ở trên (obstacles) — A* tránh mọi block khác
    let astar = null;
    try { astar = routeAvoidingBlocks(A, B, obstacles || []); } catch { /* nt */ }

    if (astar) {
      path = roundedOrthPath(astar, 8);
      const mid = polylineMidpoint(astar);
      labelX = mid.x; labelY = mid.y;
    } else {
      const [p, lx, ly] = getSmoothStepPath({
        sourceX: A.x, sourceY: A.y, targetX: B.x, targetY: B.y,
        sourcePosition, targetPosition, borderRadius: 12,
      });
      path = p;
      labelX = lx;
      labelY = ly;
    }
  }

  const label = edgeLabelOf(kind, elabel, palette);
  const cls = [
    'edge',
    kind === 'case' ? 'dashed' : '',
    kind === 'loop' ? 'loop' : '',
    lit ? 'lit' : '',
    dimmed ? 'dimmed' : '',
    focus ? 'focus' : '',
    mainPath || pl ? 'pl' : '', // 🧭 luồng chính hoặc 📖 hover câu
  ].filter(Boolean).join(' ');

  // Edge không nhãn (plain/case…) nhưng CÓ note thì vẫn phải hiện dấu • màu
  // state ở giữa đường (bản cũ: .edgeDot) — trước đây dot chỉ gắn trong nhãn
  // nên edge không nhãn mất dot hoàn toàn.
  const showDot = !!noteState;

  // C4: marker đặt NGAY TRONG SVG của React Flow (component edge render bên
  // trong <svg> edges) — id riêng theo edge để không đụng id. Trước đây defs
  // nằm ở một <svg> 0×0 NGOÀI → Safari có bug tham chiếu marker cross-SVG
  // (mất đầu mũi tên).
  const markerId = 'arr-' + id;

  return (
    <>
      <defs>
        <marker
          id={markerId}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={sty.col} />
        </marker>
      </defs>
      <BaseEdge
        id={id}
        path={path}
        className={cls}
        markerEnd={`url(#${markerId})`}
        style={{
          stroke: sty.col,
          // Nét đứt/độ dày để CSS lo nguyên văn bản cũ: .edge 1.7 · .edge.loop 1.5+8 4
          // · .edge.dashed (case) 6 4 · hover 3 · focus 2.8 (trong #board.nhover).
          // (Inline style trước đây ÁT CSS và còn gán nhầm nét đứt cho edge 'false'.)
          opacity: dimmed ? 0.25 : undefined,
        }}
      />
      {label || showDot ? (
        <EdgeLabelRenderer>
          <div
            className={'elbl' + (focus ? ' focus' : '') + (dimmed ? ' dimmed' : '')}
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              color: sty.col,
              pointerEvents: 'none',
            }}
          >
            {label}
            {showDot ? <span className={'nb nb-' + noteState} title="Edge này có AI note (click edge để xem)">•</span> : null}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

/** @deprecated C4: marker giờ do từng CfgEdge tự render TRONG cùng SVG
 *  (Safari không tham chiếu được marker cross-SVG). Giữ export để tương thích. */
export function EdgeMarkers({ theme = 'dark' }) {
  const palette = EDGE_PALETTES[theme === 'light' ? 'light' : 'dark'];
  return (
    <svg style={{ position: 'absolute', width: 0, height: 0 }} aria-hidden="true">
      <defs>
        {Object.entries(palette).map(([kind, sty]) => (
          <marker
            key={kind}
            id={'arrow-' + kind}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={sty.col} />
          </marker>
        ))}
      </defs>
    </svg>
  );
}

export const CfgEdge = memo(CfgEdgeInner);
export default CfgEdge;
