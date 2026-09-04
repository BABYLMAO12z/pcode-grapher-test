// @vitest-environment node
/* Test hồi quy đợt rà soát 2 — PHẦN L của BUG-REPORT.md
 * L1: refMap phải khoá bằng savedRef (không gian ref lúc export), nếu không
 *     edge note orphan/gắn nhầm mũi tên khi đánh số block dịch.
 * L2: do-while thân RỖNG phải giữ mũi tên loop (self-loop trên cond). */
import { describe, it, expect } from 'vitest';
import { lex } from '../../src/core/lexer.js';
import { parseFunction } from '../../src/core/parser.js';
import { CfgBuilder } from '../../src/core/cfg.js';
import { buildAnchors, buildEdgeAnchors } from '../../src/core/anchors.js';
import { makeEnv, setEnv } from '../../src/notes/env.js';
import { reanchorNotes } from '../../src/notes/anchors.js';

const graphOf = (src) => new CfgBuilder().build(parseFunction(lex(src)));

const V1 = `void f(int a)
{
  if (p) {
    prep();
  }
  if (a) {
    y();
  } else {
    z();
  }
  done();
}`;

// chèn if(m){extra();} vào thân if đầu → đánh số block dịch +1 từ B3
const V2 = `void f(int a)
{
  if (p) {
    prep();
    if (m) {
      extra();
    }
  }
  if (a) {
    y();
  } else {
    z();
  }
  done();
}`;

/** Notes như exportAIData tạo ra từ graph v1 (ref = không gian v1). */
function savedNotesFrom(g) {
  const a = buildAnchors(g);
  const e = buildEdgeAnchors(g);
  const refOf = {};
  a.forEach((x) => { refOf[x.nodeId] = x.ref; });
  return {
    meta: {},
    blocks: a.map((x) => ({
      ref: x.ref, kind: x.kind, lines: x.lines, skeleton: x.skeleton,
      skHash: x.skHash, ids: x.ids, note: 'note ' + x.ref, plain: '', manual: false,
    })),
    edges: e.map((x) => ({
      ref: x.ref, from: refOf[x.from], to: refOf[x.to], kind: x.kind,
      label: x.elabel || '', note: 'note ' + x.ref, manual: false,
    })),
    summary: { sentences: [], sideEffects: [], unknowns: [] },
    match: null,
  };
}

function reanchorOn(graphData, notes) {
  const env = makeEnv({});
  env.notes = notes;
  env.graphData = graphData;
  env.lastParsed = { fn: 'f', header: [] };
  setEnv(env);
  return { r: reanchorNotes(), env };
}

describe('L1 — reanchor edge notes sau khi đánh số block dịch', () => {
  it('cùng source: mọi block/edge note đều ok', () => {
    const g = graphOf(V1);
    const notes = savedNotesFrom(g);
    const { r } = reanchorOn(g, notes);
    expect(r.blockOrphan).toBe(0);
    expect(r.edgeOrphan).toBe(0);
    expect(r.edgeOk).toBe(notes.edges.length);
  });

  it('chèn block phía trước: edge notes theo block đã dịch, không orphan hàng loạt', () => {
    const g1 = graphOf(V1);
    const notes = savedNotesFrom(g1);
    const g2 = graphOf(V2);
    const { r, env } = reanchorOn(g2, notes);
    // block: 6/6 khớp (skeleton giữ nguyên, chỉ dịch số)
    expect(r.blockOrphan).toBe(0);
    // edge: trước fix L1 → 4/7 orphan + 2 khớp NHẦM; sau fix ≥ 6/7 ok
    expect(r.edgeOk).toBeGreaterThanOrEqual(notes.edges.length - 1);
    expect(r.edgeOrphan).toBeLessThanOrEqual(1);

    // kiểm tra đích danh: E4 lưu là cạnh true của if(a) (B3→B4 cũ) phải khớp
    // vào cạnh true của if(a) trong graph MỚI — không phải cạnh khác.
    const a2 = buildAnchors(g2);
    const refOf2 = {};
    a2.forEach((x) => { refOf2[x.nodeId] = x.ref; });
    const e2 = buildEdgeAnchors(g2);
    const savedE4 = notes.edges.find((x) => x.ref === 'E4');
    expect(savedE4.kind).toBe('true');
    const m = env.notes.match.edgeByRef['E4'];
    expect(m.idx).not.toBeNull();
    const hit = e2[m.idx];
    expect(hit.kind).toBe('true');
    // from của cạnh khớp phải là block if(a) — chính là block mà B3 cũ re-anchor tới
    const b3New = env.notes.match.byRef['B3'];
    expect(hit.from).toBe(b3New.nodeId);
    expect(m.state).toBe('ok');
  });

  it('quiet trial (L6) không đụng match UI-side nhưng vẫn trả counts', () => {
    const g = graphOf(V1);
    const notes = savedNotesFrom(g);
    const env = makeEnv({});
    env.notes = notes;
    env.graphData = g;
    env.lastParsed = { fn: 'f', header: [] };
    setEnv(env);
    const r = reanchorNotes({ quiet: true });
    expect(r.blockOk).toBe(notes.blocks.length);
    expect(r.renamed).toBe(0);
  });
});

describe('L2 — do-while thân rỗng giữ mũi tên loop', () => {
  it('giữa hàm: cond có self-loop kind=loop', () => {
    const g = graphOf('void f()\n{\n  x();\n  do {\n  } while (a);\n  g();\n}');
    const loop = g.edges.find((e) => e.kind === 'loop');
    expect(loop).toBeTruthy();
    expect(loop.from).toBe(loop.to); // self-loop trên cond
  });

  it('cuối hàm: vẫn còn loop', () => {
    const g = graphOf('void f()\n{\n  x();\n  do {\n  } while (a);\n}');
    expect(g.edges.some((e) => e.kind === 'loop')).toBe(true);
  });

  it('thân KHÔNG rỗng: topology như cũ (loop về thân, không self-loop)', () => {
    const g = graphOf('void f()\n{\n  p();\n  do {\n    x();\n  } while (a);\n  g();\n}');
    const loop = g.edges.find((e) => e.kind === 'loop');
    expect(loop).toBeTruthy();
    expect(loop.from).not.toBe(loop.to);
  });

  it('collapse không sinh self-loop plain rác', () => {
    // if lồng nhau có block rỗng — không được tạo self-loop plain
    const g = graphOf('void f()\n{\n  if (a) {\n  }\n  b();\n}');
    expect(g.edges.some((e) => e.from === e.to && e.kind !== 'loop')).toBe(false);
  });
});
