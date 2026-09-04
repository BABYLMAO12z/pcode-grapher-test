// @vitest-environment node
/* =========================================================================
 * tests/graph/routes.test.js — hồi quy cho fix "mũi tên đè" (BUG-REPORT A1-A3)
 *  · elkRoutePoints: trích waypoints từ kết quả elk.layout
 *  · snapToRect / snapRouteEnd: kéo đầu route về biên block THẬT, giữ vuông góc
 *  · roundedOrthPath / polylineMidpoint: path bo góc + vị trí nhãn theo độ dài
 *  · layoutGraph (ELK THẬT): mọi edge có route, cặp edge song song (T/F của
 *    guard clause) route KHÁC nhau, endpoint nằm trên biên block thật,
 *    node kéo tay (manualPos) → route chạm nó bị loại (fallback smoothstep)
 * ========================================================================= */
import { describe, it, expect } from 'vitest';
import { lex } from '../../src/core/lexer.js';
import { parseFunction } from '../../src/core/parser.js';
import { CfgBuilder } from '../../src/core/cfg.js';
import {
  layoutGraph, elkRoutePoints, snapToRect, snapRouteEnd, snapRoutes,
} from '../../src/graph/layout.js';
import { roundedOrthPath, polylineMidpoint } from '../../src/graph/CfgEdge.jsx';

const buildCfg = (code) => new CfgBuilder().build(parseFunction(lex(code)));

/* điểm có nằm TRÊN biên rect không (dung sai t px) */
function onRectBorder(p, r, t = 1) {
  const inX = p.x >= r.x - t && p.x <= r.x + r.w + t;
  const inY = p.y >= r.y - t && p.y <= r.y + r.h + t;
  if (!inX || !inY) return false;
  return (
    Math.abs(p.y - r.y) <= t || Math.abs(p.y - (r.y + r.h)) <= t ||
    Math.abs(p.x - r.x) <= t || Math.abs(p.x - (r.x + r.w)) <= t
  );
}

describe('elkRoutePoints', () => {
  it('trích start/bend/end theo edge index, bỏ điểm trùng', () => {
    const routes = elkRoutePoints({
      edges: [{
        id: 'e0',
        sections: [{
          startPoint: { x: 10, y: 0 },
          bendPoints: [{ x: 10, y: 0 }, { x: 10, y: 40 }, { x: 60, y: 40 }],
          endPoint: { x: 60, y: 80 },
        }],
      }],
    });
    expect(routes[0]).toEqual([
      { x: 10, y: 0 }, { x: 10, y: 40 }, { x: 60, y: 40 }, { x: 60, y: 80 },
    ]);
  });

  it('route < 2 điểm hoặc id không parse được → bỏ qua', () => {
    expect(elkRoutePoints({ edges: [{ id: 'exx', sections: [] }] })).toEqual({});
  });
});

describe('snapToRect / snapRouteEnd', () => {
  const rect = { x: 0, y: 0, w: 100, h: 40 };

  it('điểm ngoài ô phồng noteReserve → kéo về cạnh dưới block thật', () => {
    // ELK neo edge tại đáy ô phồng (x=180 vượt block thật w=100, y=90 dưới đáy 40)
    const q = snapToRect({ x: 180, y: 90 }, rect);
    expect(q.y).toBe(40);              // đáy block thật
    expect(q.x).toBeLessThanOrEqual(94); // clamp vào trong cạnh (pad 6)
  });

  it('snapRouteEnd giữ vuông góc: đoạn kề dọc → dịch x của bend theo', () => {
    const pts = [{ x: 180, y: 44 }, { x: 180, y: 90 }, { x: 300, y: 90 }];
    snapRouteEnd(pts, rect, true);
    expect(pts[0].y).toBe(40);
    expect(pts[0].x).toBeLessThanOrEqual(94);
    expect(pts[1].x).toBe(pts[0].x);   // bend dịch theo → không có đoạn chéo
    expect(pts[1].y).toBe(90);         // trục ngang kế tiếp không đổi
  });

  it('route 2 điểm thành chéo → chêm 2 bend giữ vuông góc', () => {
    const pts = [{ x: 150, y: 60 }, { x: 150, y: 200 }];
    snapRouteEnd(pts, rect, true);     // đầu bị kéo về biên (x đổi) → chéo
    expect(pts.length).toBe(4);
    // mọi đoạn phải song song trục
    for (let i = 1; i < pts.length; i++) {
      const dx = Math.abs(pts[i].x - pts[i - 1].x);
      const dy = Math.abs(pts[i].y - pts[i - 1].y);
      expect(Math.min(dx, dy)).toBeLessThan(0.01);
    }
  });

  it('điểm đã nằm trên biên thật → không đổi gì', () => {
    const pts = [{ x: 50, y: 40 }, { x: 50, y: 90 }];
    snapRouteEnd(pts, rect, true);
    expect(pts).toEqual([{ x: 50, y: 40 }, { x: 50, y: 90 }]);
  });
});

describe('roundedOrthPath / polylineMidpoint', () => {
  it('path bắt đầu M đúng điểm đầu, kết thúc L đúng điểm cuối, có bo góc Q', () => {
    const d = roundedOrthPath([{ x: 0, y: 0 }, { x: 0, y: 50 }, { x: 80, y: 50 }], 8);
    expect(d.startsWith('M0,0')).toBe(true);
    expect(d).toContain('Q0,50');
    expect(d.endsWith('L80,50')).toBe(true);
  });

  it('midpoint theo ĐỘ DÀI (không phải theo chỉ số điểm)', () => {
    // tổng dài 100 (50 dọc + 50 ngang) → giữa = đúng góc bend
    const m = polylineMidpoint([{ x: 0, y: 0 }, { x: 0, y: 50 }, { x: 50, y: 50 }]);
    expect(m).toEqual({ x: 0, y: 50 });
    // lệch dài: 80 dọc + 20 ngang → giữa nằm trên đoạn dọc tại y=50
    const m2 = polylineMidpoint([{ x: 0, y: 0 }, { x: 0, y: 80 }, { x: 20, y: 80 }]);
    expect(m2).toEqual({ x: 0, y: 50 });
  });
});

describe('layoutGraph + ELK thật (integration)', () => {
  it('guard clause "if(a){} b();": 2 edge T/F cùng cặp node có route RIÊNG, endpoint trên biên block thật', async () => {
    const g = buildCfg('void f(int a){ if (a) { } b(); }');
    // đúng hình dạng đã chứng minh trong BUG-REPORT: 2 edge cùng from→to
    expect(g.edges.length).toBe(2);
    expect(g.edges[0].from).toBe(g.edges[1].from);
    expect(g.edges[0].to).toBe(g.edges[1].to);

    const layout = await layoutGraph(g, { forceEngine: 'elk' });
    expect(layout.engine).toBe('elk');
    expect(layout.routes[0]).toBeTruthy();
    expect(layout.routes[1]).toBeTruthy();

    // 2 route KHÔNG trùng khít (trước fix: cùng 1 đường smoothstep 100%)
    const same = JSON.stringify(layout.routes[0]) === JSON.stringify(layout.routes[1]);
    expect(same).toBe(false);

    // endpoint mỗi route nằm TRÊN biên block tương ứng
    g.edges.forEach((e, i) => {
      const pts = layout.routes[i];
      const rs = { ...layout.positions[e.from], w: layout.sizes[e.from].width, h: layout.sizes[e.from].height };
      const rt = { ...layout.positions[e.to], w: layout.sizes[e.to].width, h: layout.sizes[e.to].height };
      expect(onRectBorder(pts[0], rs, 1.5)).toBe(true);
      expect(onRectBorder(pts[pts.length - 1], rt, 1.5)).toBe(true);
    });
  });

  it('do-while: edge loop ngược (target phía trên) vẫn có route ELK', async () => {
    const g = buildCfg('void f(){ do { x(); } while (a); y(); }');
    const loopIdx = g.edges.findIndex((e) => e.kind === 'loop');
    expect(loopIdx).toBeGreaterThanOrEqual(0);
    const layout = await layoutGraph(g, { forceEngine: 'elk' });
    expect(layout.routes[loopIdx]).toBeTruthy();
    expect(layout.routes[loopIdx].length).toBeGreaterThanOrEqual(2);
  });

  it('noteReserve phồng width: endpoint vẫn snap về biên block THẬT', async () => {
    const g = buildCfg('void f(int a){ if (a) { u(); } v(); }');
    const reserve = {};
    for (const n of g.nodes) reserve[n.id] = { w: 292, h: 400 };
    const layout = await layoutGraph(g, { forceEngine: 'elk', noteReserve: reserve });
    g.edges.forEach((e, i) => {
      const pts = layout.routes[i];
      if (!pts) return;
      const rs = { ...layout.positions[e.from], w: layout.sizes[e.from].width, h: layout.sizes[e.from].height };
      const rt = { ...layout.positions[e.to], w: layout.sizes[e.to].width, h: layout.sizes[e.to].height };
      expect(onRectBorder(pts[0], rs, 1.5)).toBe(true);
      expect(onRectBorder(pts[pts.length - 1], rt, 1.5)).toBe(true);
    });
  });

  it('manualPos kéo node đi chỗ khác → route chạm node đó bị loại', async () => {
    const g = buildCfg('void f(int a){ if (a) { u(); } v(); }');
    const nid = g.nodes[g.nodes.length - 1].id;
    const layout = await layoutGraph(g, { forceEngine: 'elk', manualPos: { [nid]: { x: 999, y: 999 } } });
    g.edges.forEach((e, i) => {
      if (e.from === nid || e.to === nid) expect(layout.routes[i]).toBeUndefined();
      else expect(layout.routes[i]).toBeTruthy();
    });
  });
});
