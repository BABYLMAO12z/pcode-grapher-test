/* Hồi quy cho 2 fix:
 *  1) toFlowGraph: data.note phải là text note thật (trước đây luôn '' vì đọc
 *     .text/.summary — field không tồn tại trên saved-block).
 *  2) computeHighlights(ctx.noteTextById): F6 — highlight phủ cả note text.
 */
import { describe, it, expect } from 'vitest';
import { toFlowGraph } from '../../src/graph/build.js';
import { computeHighlights } from '../../src/ui/search.js';

const graphData = {
  nodes: [
    { id: 0, kind: 'block', lines: [{ toks: [{ t: 'id', v: 'alpha' }], semi: true }], flags: {} },
    { id: 1, kind: 'block', lines: [{ toks: [{ t: 'id', v: 'beta' }], semi: true }], flags: {} },
  ],
  edges: [{ from: 0, to: 1, kind: 'plain', elabel: '' }],
};
const layout = {
  positions: { 0: { x: 0, y: 0 }, 1: { x: 0, y: 100 } },
  sizes: { 0: { width: 100, height: 50 }, 1: { width: 100, height: 50 } },
  routes: {},
};
const notes = {
  blocks: [{ ref: 'B1', note: 'block này xử lý checksum_zeta', plain: 'tính tổng kiểm tra' }],
  edges: [],
  match: {
    byRef: { B1: { nodeId: 0, anchorRef: 'B1', score: 1, state: 'ok' } },
    edgeByRef: {},
    nodeToSavedRef: { 0: 'B1' },
    edgeIdxToSavedRef: {},
  },
};

describe('toFlowGraph data.note', () => {
  it('mang text note thật, không phải chuỗi rỗng', () => {
    const { nodes } = toFlowGraph(graphData, layout, { nodeRefMap: { 0: 'B1', 1: 'B2' }, notes, notesMode: 'badge' });
    expect(nodes[0].data.note).toBe('block này xử lý checksum_zeta');
    expect(nodes[0].data.noteState).toBe('ok');
  });

  it('null khi block không có note / không có notes', () => {
    const { nodes } = toFlowGraph(graphData, layout, { nodeRefMap: { 0: 'B1', 1: 'B2' }, notes, notesMode: 'badge' });
    expect(nodes[1].data.note).toBe(null);
    const r2 = toFlowGraph(graphData, layout, { nodeRefMap: { 0: 'B1', 1: 'B2' }, notes: null, notesMode: 'off' });
    expect(r2.nodes[0].data.note).toBe(null);
  });
});

describe('computeHighlights với note text', () => {
  const noteTextById = { 0: 'block này xử lý checksum_zeta\ntính tổng kiểm tra' };

  it('sáng block mà key chỉ xuất hiện trong note (viền cam .hit)', () => {
    const r = computeHighlights(graphData, ['checksum_zeta'], { opts: {}, noteTextById });
    expect(r.lit['n0']).toBe(true);
    expect(r.hit['n0']).toBe(true);
    expect(r.lit['n1']).toBeFalsy();
    expect(r.total).toBe(1);
    expect(r.order).toEqual([0]);
    expect(r.info).toContain('khớp trong note');
  });

  it('khớp token code vẫn ưu tiên (không gắn .hit)', () => {
    const r = computeHighlights(graphData, ['alpha'], { opts: {}, noteTextById });
    expect(r.lit['n0']).toBe(true);
    expect(r.hit['n0']).toBeFalsy();
  });

  it('không có noteTextById → hành vi cũ, không crash', () => {
    const r = computeHighlights(graphData, ['checksum_zeta'], { opts: {} });
    expect(r.total).toBe(0);
    expect(r.info).not.toContain('khớp trong note');
    // fallback không khớp block nào → không được báo "(khớp văn bản)" oan
    expect(r.info).not.toContain('khớp văn bản');
  });

  it('solo + dim vẫn tôn trọng node khớp qua note', () => {
    const r = computeHighlights(graphData, ['zeta'], { opts: { searchSolo: true, dim: true }, noteTextById });
    expect(r.lit['n0']).toBe(true);
    expect(r.hidden['n1']).toBe(true);
    expect(r.hidden['n0']).toBeFalsy();
  });
});
