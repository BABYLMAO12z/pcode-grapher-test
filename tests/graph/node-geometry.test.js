/* Hình học block: chiều cao PHẢI suy ra từ số dòng code (FIX(35)).
 * Đây là bất biến chống lỗi "mũi tên không khớp block": handle của React Flow
 * nằm ở mép trên/dưới hộp node, nên hộp sai chiều cao là mũi tên rời khỏi block. */
import { describe, it, expect } from 'vitest';
import {
  nodeHeightFromLines, collapsibleBlock, LN_H, MORE_H,
  NODE_BORDER, NODE_PAD_Y, LABEL_PAD_Y, HEAD_L, TAIL_L, COLLAPSE_AT,
} from '../../src/graph/constants.js';
import { measureNodes } from '../../src/graph/layout.js';

const mk = (nLines, kind = 'block') => ({
  id: 1, kind, lines: Array.from({ length: nLines }, (_, i) => ({ toks: [{ t: 'id', v: 'a' + i }], semi: true })),
});

describe('hình học block theo số dòng', () => {
  it('block thường: cao = dòng × LN_H + padding + viền', () => {
    const n = mk(5);
    expect(collapsibleBlock(n)).toBe(false);
    expect(nodeHeightFromLines(n, false)).toBe(5 * LN_H + NODE_PAD_Y * 2 + NODE_BORDER * 2);
  });

  it('block nhãn dùng padding nhỏ hơn', () => {
    expect(nodeHeightFromLines(mk(1, 'label'), false))
      .toBe(LN_H + LABEL_PAD_Y * 2 + NODE_BORDER * 2);
  });

  it('block dài: gập chỉ tính HEAD+TAIL, mở rộng tính đủ mọi dòng', () => {
    const tot = COLLAPSE_AT + 20; // chắc chắn vượt ngưỡng gập
    const n = mk(tot);
    expect(collapsibleBlock(n)).toBe(true);
    const collapsed = nodeHeightFromLines(n, false);
    const expanded = nodeHeightFromLines(n, true);
    expect(collapsed).toBe((HEAD_L + TAIL_L) * LN_H + MORE_H + NODE_PAD_Y * 2 + NODE_BORDER * 2);
    expect(expanded).toBe(tot * LN_H + MORE_H + NODE_PAD_Y * 2 + NODE_BORDER * 2);
    // mở rộng phải cao hơn ĐÚNG số dòng được hiện thêm
    expect(expanded - collapsed).toBe((tot - HEAD_L - TAIL_L) * LN_H);
  });

  it('measureNodes trả chiều cao theo số dòng (không phụ thuộc số đo DOM)', () => {
    const g = { nodes: [mk(6)], edges: [] };
    const sizes = measureNodes(g, { useCache: false });
    expect(sizes[1].height).toBe(nodeHeightFromLines(g.nodes[0], false));
  });

  it('đổi trạng thái mở rộng thì measureNodes đổi chiều cao tương ứng', () => {
    const n = mk(COLLAPSE_AT + 10);
    const g = { nodes: [n], edges: [] };
    const a = measureNodes(g, { useCache: false, expanded: {} })[1].height;
    const b = measureNodes(g, { useCache: false, expanded: { 1: true } })[1].height;
    expect(b - a).toBe((n.lines.length - HEAD_L - TAIL_L) * LN_H);
  });
});
