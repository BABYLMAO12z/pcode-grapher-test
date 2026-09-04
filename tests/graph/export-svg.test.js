// @vitest-environment node
/* Test hồi quy L4 — SVG export phải vẽ theo route ELK như màn hình:
 * route hợp lệ → path polyline bo góc; self-loop → cung riêng (không suy biến);
 * edge song song không route → offset tách nhau. */
import { describe, it, expect } from 'vitest';
import { buildExportSVG } from '../../src/export/svg.js';

const G = {
  nodes: [
    { id: 1, kind: 'entry', lines: [{ text: 'void f()' }] },
    { id: 2, kind: 'cond', lines: [{ text: 'if (a)' }] },
    { id: 3, kind: 'block', lines: [{ text: 'x();' }] },
  ],
  edges: [
    { from: 1, to: 2, kind: 'plain', elabel: '' },
    { from: 2, to: 3, kind: 'true', elabel: '' },
    { from: 2, to: 3, kind: 'false', elabel: '' }, // song song cùng cặp
    { from: 2, to: 2, kind: 'loop', elabel: '' },  // self-loop
  ],
};
const positions = { 1: { x: 0, y: 0 }, 2: { x: 0, y: 120 }, 3: { x: 0, y: 260 } };
const sizes = {
  1: { width: 120, height: 40 },
  2: { width: 120, height: 40 },
  3: { width: 120, height: 40 },
};

describe('L4 — buildExportSVG đồng bộ route ELK', () => {
  it('dùng route khi endpoint còn bám block', () => {
    const routes = { 0: [{ x: 60, y: 40 }, { x: 60, y: 80 }, { x: 60, y: 120 }] };
    const svg = buildExportSVG({ graphData: G, positions, sizes, routes });
    // path đầu tiên phải bắt đầu đúng waypoint đầu của route
    expect(svg).toContain('M60,40');
  });

  it('route lỗi thời (node đã kéo đi) → fallback, không dùng route', () => {
    const routes = { 0: [{ x: 900, y: 900 }, { x: 900, y: 990 }] };
    const svg = buildExportSVG({ graphData: G, positions, sizes, routes });
    expect(svg).not.toContain('M900,900');
  });

  it('self-loop vẽ cung riêng, không suy biến xuyên block', () => {
    const svg = buildExportSVG({ graphData: G, positions, sizes, routes: {} });
    // cung self-loop: từ đáy-giữa (60,160) có control lệch phải +46
    expect(svg).toContain('M 60.0,160.0 C 106.0,190.0 106.0,90.0 60.0,120.0');
  });

  it('2 edge song song fallback tách offset — path KHÁC nhau', () => {
    const svg = buildExportSVG({ graphData: G, positions, sizes, routes: {} });
    const paths = [...svg.matchAll(/<path class="edge[^"]*" d="([^"]+)"/g)].map((m) => m[1]);
    // edge idx 1 và 2 (2→3 true/false) phải khác path
    expect(paths.length).toBeGreaterThanOrEqual(4);
    const e1 = paths[1], e2 = paths[2];
    expect(e1).not.toBe(e2);
  });
});
