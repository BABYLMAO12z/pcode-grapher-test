/* =========================================================================
 * PCODE Grapher · src/graph/astarRoute.js — U10: router trực giao TRÁNH BLOCK
 * Khi node bị kéo tay khỏi vị trí layout, route ELK của edge không còn khớp
 * điểm neo (CfgEdge anchorsOk fail) → trước đây fallback getSmoothStepPath
 * KHÔNG tránh block → mũi tên xuyên thẳng qua các block khác ("graph loạn").
 * Module này: A* trên lưới 10px, chặn các ô trùng rect block (đã phồng nhẹ),
 * phạt rẽ để đường thẳng nhất có thể → trả về waypoints trực giao.
 *
 * Toạ độ: GRAPH (cùng hệ với node.position của React Flow).
 * ========================================================================= */

const CELL = 10;          // kích thước ô lưới (px)
const TURN_PENALTY = 26;  // phạt rẽ hướng (~2.6 ô) — ưu tiên đường thẳng
const INFLATE = 3;        // phồng rect block thêm px để đường không sát mép
const MAX_CELLS = 320;    // lưới tối đa 320×320 ô (3200px) — quá to thì fallback
const PAD = 40;           // viền quanh bbox

const key5 = (v) => Math.round(v / 5) * 5;
const cache = new Map();

/**
 * Tìm đường trực giao từ a → b tránh mọi rect trong rects.
 * @param {{x:number,y:number}} a điểm đầu (trên biên block nguồn)
 * @param {{x:number,y:number}} b điểm cuối (trên biên block đích)
 * @param {{x:number,y:number,w:number,h:number}[]} rects các block PHẢI tránh
 *   (đã loại node nguồn/đích). Toạ độ graph.
 * @returns {{x:number,y:number}[]|null} waypoints (gồm a, b) hoặc null nếu
 *   không tìm được (lưới quá to / bí đường) — caller fallback smoothstep.
 */
export function routeAvoidingBlocks(a, b, rects = []) {
  if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(a.y) ||
      !Number.isFinite(b.x) || !Number.isFinite(b.y)) return null;

  // cache theo toạ độ làm tròn 5px — kéo node phát tán sự kiện liên tục
  const ck = [a.x, a.y, b.x, b.y].map(key5).join(',') + '|' +
    rects.map((r) => [r.x, r.w, r.y, r.h].map(key5).join(',')).join(';');
  if (cache.has(ck)) return cache.get(ck);
  if (cache.size > 600) cache.clear();

  // FIX(4): bbox phải chứa CẢ HAI đầu mút. Trước đây chỉ seed bằng `a` nên khi
  // b nằm ngoài hình bao các rect (cạnh back-edge đi lên/ra ngoài cụm), ô đích
  // rơi ngoài lưới → clamp về biên → A* trả đường cụt hoặc null.
  let minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x);
  let minY = Math.min(a.y, b.y), maxY = Math.max(a.y, b.y);
  for (const r of rects) {
    minX = Math.min(minX, r.x); maxX = Math.max(maxX, r.x + r.w);
    minY = Math.min(minY, r.y); maxY = Math.max(maxY, r.y + r.h);
  }
  const gx0 = Math.floor((minX - PAD) / CELL), gx1 = Math.ceil((maxX + PAD) / CELL);
  const gy0 = Math.floor((minY - PAD) / CELL), gy1 = Math.ceil((maxY + PAD) / CELL);
  const W = gx1 - gx0 + 1, H = gy1 - gy0 + 1;
  if (W <= 0 || H <= 0 || W > MAX_CELLS || H > MAX_CELLS) return null;

  const N = W * H;
  const blocked = new Uint8Array(N);
  for (const r of rects) {
    const x0 = Math.floor((r.x - INFLATE) / CELL) - gx0, x1 = Math.floor((r.x + r.w + INFLATE) / CELL) - gx0;
    const y0 = Math.floor((r.y - INFLATE) / CELL) - gy0, y1 = Math.floor((r.y + r.h + INFLATE) / CELL) - gy0;
    for (let gy = Math.max(0, y0); gy <= Math.min(H - 1, y1); gy++) {
      for (let gx = Math.max(0, x0); gx <= Math.min(W - 1, x1); gx++) blocked[gy * W + gx] = 1;
    }
  }

  const toCell = (p) => ({
    x: Math.max(0, Math.min(W - 1, Math.round(p.x / CELL) - gx0)),
    y: Math.max(0, Math.min(H - 1, Math.round(p.y / CELL) - gy0)),
  });
  const s = toCell(a), t = toCell(b);
  // điểm đầu/cuối luôn được đi (bám biên block, có thể trong vùng phồng)
  const sIdx = s.y * W + s.x, tIdx = t.y * W + t.x;
  blocked[sIdx] = 0; blocked[tIdx] = 0;

  /* A* trên state (Ô, HƯỚNG VÀO). FIX(19): trước đây state chỉ là Ô trong khi
   * chi phí lại PHỤ THUỘC HƯỚNG (TURN_PENALTY) → g[] của một ô được chốt theo
   * hướng đến đầu tiên, đường tốt hơn nhưng vào ô đó theo hướng khác bị loại →
   * route thừa khúc rẽ (đo ngẫu nhiên: 41/49 ca kém tối ưu). Tài liệu
   * "Orthogonal Connector Routing" (Wybrow/Marriott/Stuckey, GD'09) nói rõ: khi
   * số khúc gãy nằm trong hàm chi phí thì state phải mang cả hướng của đường đi.
   * 4 hướng + 1 state \"chưa có hướng\" cho ô xuất phát. */
  const DIRN = 5; // 0=→ 1=↓ 2=← 3=↑ 4=chưa đi bước nào
  const S = N * DIRN;
  const g = new Float64Array(S).fill(Infinity);
  const from = new Int32Array(S).fill(-1); // state cha
  const heap = []; // [f, state]
  const push = (f, st) => { heap.push([f, st]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const hEst = (idx) => (Math.abs((idx % W) - t.x) + Math.abs(((idx / W) | 0) - t.y)) * CELL;

  const closed = new Uint8Array(S);
  const startState = sIdx * DIRN + 4;
  g[startState] = 0;
  push(hEst(sIdx), startState);
  const DIRS = [[1, 0, 0], [0, 1, 1], [-1, 0, 2], [0, -1, 3]];
  let goalState = -1, guard = 0;
  const guardMax = S * 4;
  while (heap.length && guard++ < guardMax) {
    const [, st] = pop();
    if (closed[st]) continue; // entry cũ trong heap (state đã chốt)
    closed[st] = 1;
    const cur = (st / DIRN) | 0, curDir = st % DIRN;
    if (cur === tIdx) { goalState = st; break; }
    const cx = cur % W, cy = (cur / W) | 0;
    for (const [dx, dy, nd] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = ny * W + nx;
      if (blocked[ni] && ni !== tIdx) continue;
      const turn = curDir !== 4 && curDir !== nd ? TURN_PENALTY : 0;
      const ng = g[st] + CELL + turn;
      const nst = ni * DIRN + nd;
      if (ng < g[nst] - 1e-9) {
        g[nst] = ng; from[nst] = st;
        push(ng + hEst(ni), nst);
      }
    }
  }
  if (goalState < 0) { cache.set(ck, null); return null; }

  // phục hồi đường: TOÀN BỘ điểm lấy theo lưới (mọi đoạn ngang/dọc), sau đó mới
  // nối a/b thật vào hai đầu.
  const cells = [];
  for (let st = goalState; st !== -1; st = from[st]) cells.push((st / DIRN) | 0);
  cells.reverse();
  const grid = cells.map((i) => ({ x: (gx0 + (i % W)) * CELL, y: (gy0 + ((i / W) | 0)) * CELL }));
  const merged = [grid[0]];
  for (let i = 1; i < grid.length - 1; i++) {
    const p0 = merged[merged.length - 1], p1 = grid[i], p2 = grid[i + 1];
    const collinear = (p0.x === p1.x && p1.x === p2.x) || (p0.y === p1.y && p1.y === p2.y);
    if (!collinear) merged.push(p1);
  }
  if (grid.length > 1) merged.push(grid[grid.length - 1]);

  /* FIX(20): a/b là điểm THẬT trên biên block, hiếm khi rơi đúng bội số CELL —
   * bản cũ nối thẳng a vào điểm lưới kế tiếp nên router \"trực giao\" vẫn sinh
   * ĐOẠN CHÉO ở hai đầu (đo được 2 đoạn chéo/route, mũi tên cắm xiên vào block).
   * Chêm khuỷu vuông góc: hướng của khuỷu chọn theo đoạn lưới kề để không tạo
   * thêm khúc rẽ thừa. */
  const out = attachEnd(merged, a, true);
  const out2 = attachEnd(out, b, false);
  dedupe(out2);
  cache.set(ck, out2);
  return out2;
}

/* Nối điểm thật p vào đầu (atStart) hoặc cuối polyline lưới, giữ mọi đoạn vuông góc. */
function attachEnd(pts, p, atStart) {
  const q = atStart ? pts[0] : pts[pts.length - 1];
  const nb = atStart ? pts[1] : pts[pts.length - 2];
  const add = [];
  if (!q) return [p];
  const aligned = Math.abs(p.x - q.x) < 0.01 || Math.abs(p.y - q.y) < 0.01;
  if (aligned) add.push(p);
  else {
    // đoạn lưới kề nằm ngang → đi DỌC từ p rồi mới rẽ; và ngược lại
    const segHorizontal = nb ? Math.abs(q.y - nb.y) < 0.01 : Math.abs(p.x - q.x) >= Math.abs(p.y - q.y);
    const elbow = segHorizontal ? { x: p.x, y: q.y } : { x: q.x, y: p.y };
    add.push(p, elbow);
  }
  return atStart ? add.concat(pts) : pts.concat(add.reverse());
}

/* Bỏ điểm trùng + điểm thẳng hàng (tại chỗ). */
function dedupe(pts) {
  for (let i = pts.length - 1; i > 0; i--) {
    if (Math.abs(pts[i].x - pts[i - 1].x) < 0.01 && Math.abs(pts[i].y - pts[i - 1].y) < 0.01) pts.splice(i, 1);
  }
  for (let i = pts.length - 2; i > 0; i--) {
    const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1];
    const col = (Math.abs(p0.x - p1.x) < 0.01 && Math.abs(p1.x - p2.x) < 0.01) ||
      (Math.abs(p0.y - p1.y) < 0.01 && Math.abs(p1.y - p2.y) < 0.01);
    if (col) pts.splice(i, 1);
  }
}

/** Xoá cache (test). */
export function _clearRouteCache() { cache.clear(); }

/**
 * Polyline có cắt/nằm qua rect nào không (Liang-Barsky mỗi đoạn).
 * Dùng để phát hiện route ELK bị block kéo tay "rơi xuống đè" (U10: anchorsOk
 * vẫn đúng vì 2 ĐẦU edge không di chuyển — nhưng giữa đường có vật cản mới).
 */
export function polylineHitsRects(pts, rects = []) {
  if (!pts || pts.length < 2 || !rects.length) return false;
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1], p1 = pts[i];
    const dx = p1.x - p0.x, dy = p1.y - p0.y;
    for (const r of rects) {
      const e = 0.5; // co rect vào trong 0.5px — bỏ qua trượt sát mép
      const rx0 = r.x + e, ry0 = r.y + e, rx1 = r.x + r.w - e, ry1 = r.y + r.h - e;
      // Liang-Barsky chuẩn: p/q cho 4 biên trái/phải/dưới/trên
      const P = [-dx, dx, -dy, dy];
      const Q = [p0.x - rx0, rx1 - p0.x, p0.y - ry0, ry1 - p0.y];
      let t0 = 0, t1 = 1, ok = true;
      for (let k = 0; k < 4; k++) {
        if (P[k] === 0) {
          if (Q[k] < 0) { ok = false; break; } // song song và nằm ngoài biên
          continue;
        }
        const t = Q[k] / P[k];
        if (P[k] < 0) { if (t > t0) t0 = t; } // đang đi VÀO
        else { if (t < t1) t1 = t; }          // đang đi RA
        if (t0 > t1) { ok = false; break; }
      }
      if (ok) return true;
    }
  }
  return false;
}
