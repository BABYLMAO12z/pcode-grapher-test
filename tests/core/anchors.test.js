import { describe, it, expect } from 'vitest';
import { lex } from '../../src/core/lexer.js';
import { parseFunction } from '../../src/core/parser.js';
import { CfgBuilder } from '../../src/core/cfg.js';
import {
  fnv1a, skeletonOf, nodeAnchors, buildAnchors, buildEdgeAnchors,
  jaccard, linesScore, matchBlocks, matchEdges, MATCH_MIN,
} from '../../src/core/anchors.js';
import { SAMPLE } from '../../src/sample.js';

const cfg = (src) => new CfgBuilder().build(parseFunction(lex(src)));
const savedOf = (anchors) => anchors.map((a) => ({
  ref: a.ref, kind: a.kind, lines: a.lines, skeleton: a.skeleton, skHash: a.skHash, ids: a.ids,
}));

describe('fnv1a', () => {
  it('hash 8 ký tự hex, ổn định', () => {
    const h = fnv1a('hello');
    expect(h).toMatch(/^[0-9a-f]{8}$/);
    expect(fnv1a('hello')).toBe(h);
  });
  it('null/undefined → hash của chuỗi rỗng', () => {
    expect(fnv1a(null)).toBe(fnv1a(''));
    expect(fnv1a(undefined)).toBe(fnv1a(''));
  });
  it('đầu vào khác → hash khác', () => {
    expect(fnv1a('a')).not.toBe(fnv1a('b'));
  });
});

describe('skeletonOf — bất biến với rename', () => {
  it('đổi tên biến KHÔNG đổi skeleton', () => {
    const a = skeletonOf(lex('alpha = beta + 1;'));
    const b = skeletonOf(lex('xx = yy + 1;'));
    expect(a).toBe(b);
    expect(a).toContain('V1');
  });
  it('giữ nguyên keyword và Ghidra-op', () => {
    const s = skeletonOf(lex('if (CONCAT44(a,b) == 0) return;'));
    expect(s).toContain('if');
    expect(s).toContain('CONCAT44');
    expect(s).toContain('return');
  });
  it('bỏ comment', () => {
    expect(skeletonOf(lex('a = 1; // note'))).toBe(skeletonOf(lex('a = 1;')));
  });
  it('đổi thứ tự biến → skeleton khác', () => {
    expect(skeletonOf(lex('a = b;'))).not.toBe(skeletonOf(lex('a = a;')));
  });
  it('token list rỗng/null → chuỗi rỗng', () => {
    expect(skeletonOf([])).toBe('');
    expect(skeletonOf(null)).toBe('');
  });
});

describe('jaccard & linesScore', () => {
  it('hai tập rỗng → 1', () => expect(jaccard([], [])).toBe(1));
  it('trùng hoàn toàn → 1', () => expect(jaccard(['a', 'b'], ['b', 'a'])).toBe(1));
  it('rời nhau → 0', () => expect(jaccard(['a'], ['b'])).toBe(0));
  it('giao một nửa', () => expect(jaccard(['a', 'b'], ['b', 'c'])).toBeCloseTo(1 / 3));
  // FIX(26): linesScore giờ chia cho HỢP (Jaccard) — vùng con lọt trong vùng lớn
  // KHÔNG còn được điểm tuyệt đối 1.0 (đó là lý do note của cả khối 10 dòng bị
  // gắn vào block 5 dòng).
  it('linesScore chia cho vùng HỢP (không thiên vị vùng ngắn)', () => {
    expect(linesScore([1, 10], [1, 5])).toBeCloseTo(5 / 10);
    expect(linesScore([1, 4], [3, 8])).toBeCloseTo(2 / 8);
    expect(linesScore([2, 6], [2, 6])).toBe(1); // trùng khít vẫn 1.0
  });
  it('linesScore không giao / thiếu tham số → 0', () => {
    expect(linesScore([1, 2], [5, 6])).toBe(0);
    expect(linesScore(null, [1, 2])).toBe(0);
  });
});

describe('nodeAnchors / buildAnchors', () => {
  const g = cfg(SAMPLE);
  const anchors = buildAnchors(g);

  it('ref liên tiếp B1..Bn theo thứ tự node cuối', () => {
    expect(anchors).toHaveLength(g.nodes.length);
    expect(anchors[0].ref).toBe('B1');
    expect(anchors[anchors.length - 1].ref).toBe('B' + g.nodes.length);
  });

  it('nodeId giữ id thật của node', () => {
    anchors.forEach((a, i) => expect(a.nodeId).toBe(g.nodes[i].id));
  });

  it('anchor có lines/skeleton/skHash/ids', () => {
    const a = anchors.find((x) => x.skeleton !== '');
    expect(a.skHash).toMatch(/^[0-9a-f]{8}$/);
    expect(Array.isArray(a.ids)).toBe(true);
    expect(a.lines[0]).toBeLessThanOrEqual(a.lines[1]);
  });

  it('ids loại keyword và Ghidra-op, không trùng lặp', () => {
    for (const a of anchors) {
      expect(a.ids).not.toContain('if');
      expect(a.ids).not.toContain('CONCAT31');
      expect(new Set(a.ids).size).toBe(a.ids.length);
    }
  });

  it('node rỗng → lines null, skeleton rỗng', () => {
    const a = nodeAnchors({ lines: [] });
    expect(a.lines).toBeNull();
    expect(a.skeleton).toBe('');
  });

  it('buildEdgeAnchors: ref E1.. và giữ idx/from/to/kind', () => {
    const ea = buildEdgeAnchors(g);
    expect(ea).toHaveLength(g.edges.length);
    expect(ea[0]).toMatchObject({ ref: 'E1', idx: 0, from: g.edges[0].from, to: g.edges[0].to });
  });

  it('graphData rỗng → mảng rỗng', () => {
    expect(buildAnchors(null)).toEqual([]);
    expect(buildEdgeAnchors(null)).toEqual([]);
  });
});

describe('matchBlocks — 3 pass', () => {
  it('pass 1 EXACT: code y hệt → tất cả state ok, khớp đúng nodeId', () => {
    const anchors = buildAnchors(cfg(SAMPLE));
    const r = matchBlocks(savedOf(anchors), anchors);
    for (const a of anchors) {
      expect(r.byRef[a.ref].state).toBe('ok');
      expect(r.byRef[a.ref].nodeId).toBe(a.nodeId);
    }
  });

  it('pass 1 sống sót qua rename toàn bộ biến', () => {
    const anchors = buildAnchors(cfg(SAMPLE));
    const saved = savedOf(anchors);
    const renamed = buildAnchors(cfg(SAMPLE.replace(/uVar13/g, 'counter').replace(/local_138/g, 'flagA')));
    const r = matchBlocks(saved, renamed);
    const states = Object.values(r.byRef).map((x) => x.state);
    expect(states.filter((s) => s === 'ok').length).toBeGreaterThanOrEqual(states.length - 1);
  });

  it('mỗi block chỉ nhận MỘT note (greedy, không claim trùng)', () => {
    const anchors = buildAnchors(cfg(SAMPLE));
    const saved = savedOf(anchors);
    const dup = saved.concat(saved.map((s) => ({ ...s, ref: s.ref + 'x' })));
    const r = matchBlocks(dup, anchors);
    const ids = Object.values(r.byRef).map((v) => v.nodeId).filter((x) => x != null);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('pass 2 COMPOSITE: code sửa nhẹ, cùng vùng dòng → stale', () => {
    const base = 'void f(){\n a = 1;\n b = 2;\n c = 3;\n d = 4;\n}';
    const mod = 'void f(){\n a = 1;\n b = 2;\n c = 3;\n d = 5;\n}';
    const saved = savedOf(buildAnchors(cfg(base)));
    const r = matchBlocks(saved, buildAnchors(cfg(mod)));
    const st = Object.values(r.byRef).map((x) => x.state);
    expect(st).toContain('stale');
  });

  it('không có ứng viên → orphan', () => {
    const anchors = buildAnchors(cfg('void f(){ a = 1; }'));
    const r = matchBlocks([{ ref: 'B9', skHash: 'deadbeef', skeleton: 'V1 = V2 * V3', lines: [900, 999], ids: ['zzz'] }], anchors);
    expect(r.byRef.B9).toEqual({ nodeId: null, anchorRef: null, score: 0, state: 'orphan' });
  });

  it('pass 1b: node label (skeleton rỗng) khớp theo kind + lines', () => {
    const src = 'void f(){ goto L; a(); L: b(); }';
    const anchors = buildAnchors(cfg(src));
    const lbl = anchors.find((a) => a.skeleton === '');
    if (lbl) {
      const r = matchBlocks([{ ref: 'B1', kind: lbl.kind, lines: lbl.lines, skeleton: '', skHash: fnv1a('') }], anchors);
      expect(r.byRef.B1.state).toBe('ok');
      expect(r.byRef.B1.nodeId).toBe(lbl.nodeId);
    }
  });

  it('pool lớn (>32 block đồng cấu) vẫn gán O(n), không crash', () => {
    const src = 'void f(){\n' + 'if(x){ y(); }\n'.repeat(60) + '}';
    const anchors = buildAnchors(cfg(src));
    const t0 = performance.now();
    const r = matchBlocks(savedOf(anchors), anchors);
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(Object.keys(r.byRef)).toHaveLength(anchors.length);
  });

  it('MATCH_MIN = 0.6', () => expect(MATCH_MIN).toBe(0.6));

  it('đầu vào null không crash', () => {
    expect(matchBlocks(null, null)).toEqual({ byRef: {} });
  });
});

describe('matchEdges', () => {
  const g = cfg(SAMPLE);
  const anchors = buildAnchors(g);
  const ea = buildEdgeAnchors(g);
  const refMap = Object.fromEntries(anchors.map((a) => [a.ref, a.nodeId]));

  it('cạnh y hệt → ok', () => {
    const saved = ea.map((e) => ({
      ref: e.ref,
      from: anchors.find((a) => a.nodeId === e.from).ref,
      to: anchors.find((a) => a.nodeId === e.to).ref,
      kind: e.kind, label: e.elabel,
    }));
    const r = matchEdges(saved, refMap, ea);
    expect(Object.values(r.byRef).every((v) => v.state === 'ok')).toBe(true);
  });

  it('đầu block không map được → orphan', () => {
    const r = matchEdges([{ ref: 'E1', from: 'BZZ', to: 'B1' }], refMap, ea);
    expect(r.byRef.E1).toEqual({ idx: null, state: 'orphan' });
  });

  it('cùng cặp nhưng kind/label khác → stale', () => {
    const e0 = ea[0];
    const saved = [{
      ref: 'E1',
      from: anchors.find((a) => a.nodeId === e0.from).ref,
      to: anchors.find((a) => a.nodeId === e0.to).ref,
      kind: 'khac-hoan-toan', label: 'zzz',
    }];
    const r = matchEdges(saved, refMap, ea);
    expect(r.byRef.E1.state).toBe('stale');
  });

  it('null an toàn', () => expect(matchEdges(null, null, null)).toEqual({ byRef: {} }));
});
