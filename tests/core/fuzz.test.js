import { describe, it, expect } from 'vitest';
import { lex } from '../../src/core/lexer.js';
import { parseFunction } from '../../src/core/parser.js';
import { CfgBuilder } from '../../src/core/cfg.js';
import { buildAnchors, buildEdgeAnchors, matchBlocks, matchEdges } from '../../src/core/anchors.js';

/* PRNG xác định (mulberry32) — fuzz phải tái lập được khi CI đỏ. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VARS = ['iVar1', 'uVar2', 'local_138', 'param_1', 'puVar9', 'alpha', 'x'];
const CALLS = ['FUN_140001000', 'QString::~QString', 'memcpy', 'g'];

function genStmt(r, depth) {
  const p = r();
  const v = () => VARS[(r() * VARS.length) | 0];
  const c = () => CALLS[(r() * CALLS.length) | 0];
  if (depth > 3 || p < 0.34) {
    const q = r();
    if (q < 0.25) return `${v()} = ${v()} + ${(r() * 100) | 0};`;
    if (q < 0.4) return `${c()}(${v()},0x${((r() * 65535) | 0).toString(16)});`;
    if (q < 0.5) return `${v()} = CONCAT44(${v()},${v()});`;
    if (q < 0.6) return '// ghi chú ngẫu nhiên';
    if (q < 0.7) return `${v()} = "chuỗi ${(r() * 999) | 0}";`;
    if (q < 0.78) return 'return;';
    if (q < 0.84) return `*(undefined4 *)(${v()} + 0x18) = 0;`;
    if (q < 0.9) return `${v()} = ${v()} >> 2 & 0xff;`;
    return `${v()}++;`;
  }
  if (p < 0.46) return `if (${v()} ${['==', '!=', '<', '>='][(r() * 4) | 0]} ${(r() * 9) | 0}) {\n${genBody(r, depth + 1)}\n}${r() < 0.5 ? ` else {\n${genBody(r, depth + 1)}\n}` : ''}`;
  if (p < 0.58) return `while (${v()} < ${(r() * 20) | 0}) {\n${genBody(r, depth + 1)}\n${r() < 0.3 ? 'break;\n' : ''}}`;
  if (p < 0.68) return `do {\n${genBody(r, depth + 1)}\n} while (${v()} != 0);`;
  if (p < 0.78) return `for (${v()} = 0; ${v()} < ${(r() * 9) | 0}; ${v()} = ${v()} + 1) {\n${genBody(r, depth + 1)}\n${r() < 0.3 ? 'continue;\n' : ''}}`;
  if (p < 0.88) {
    const n = 1 + ((r() * 3) | 0);
    let s = `switch (${v()}) {\n`;
    for (let i = 0; i < n; i++) s += `case ${i}:\n${genBody(r, depth + 1)}\n${r() < 0.7 ? 'break;\n' : ''}`;
    if (r() < 0.5) s += `default:\n${genBody(r, depth + 1)}\n`;
    return s + '}';
  }
  if (p < 0.94) return `goto LAB_${(r() * 5) | 0};`;
  return `LAB_${(r() * 5) | 0}:`;
}

function genBody(r, depth) {
  const n = 1 + ((r() * 4) | 0);
  const out = [];
  for (let i = 0; i < n; i++) out.push(genStmt(r, depth));
  return out.join('\n');
}

function genFunction(r) {
  const name = ['check', 'run', 'ns::cls::doIt', 'FUN_1400abcd'][(r() * 4) | 0];
  const head = `${['void', 'int', 'undefined8'][(r() * 3) | 0]} ${r() < 0.4 ? '__thiscall ' : ''}${name}(longlong param_1, int param_2)`;
  return `${head}\n{\n${genBody(r, 0)}\n}`;
}

/* Vài lỗi ngoài lề ĐÃ BIẾT (parser báo error, không được ném exception) */
function corrupt(r, src) {
  const q = r();
  if (q < 0.25) return src.slice(0, (src.length * (0.3 + r() * 0.6)) | 0); // cắt cụt
  if (q < 0.5) return src.replace(/;/, '');                                 // mất ;
  if (q < 0.7) return src.replace(/}/, '');                                 // mất }
  if (q < 0.85) return src.replace(/{/, '');                                // mất {
  return src + '\n@@@ ??? ###';
}

describe('fuzz 5.000 hàm ngẫu nhiên — bất biến core', () => {
  it('parse/CFG/anchor không crash, graph luôn nhất quán', () => {
    const N = 5000;
    const t0 = performance.now();
    let totalNodes = 0;
    for (let i = 0; i < N; i++) {
      const r = rng(0x1234 + i);
      let src = genFunction(r);
      if (i % 5 === 0) src = corrupt(r, src);

      let parsed, g;
      expect(() => { parsed = parseFunction(lex(src)); }, 'seed ' + i).not.toThrow();
      expect(Array.isArray(parsed.errors), 'seed ' + i).toBe(true);
      expect(parsed.errors.length, 'seed ' + i).toBeLessThanOrEqual(32);

      expect(() => { g = new CfgBuilder().build(parsed); }, 'seed ' + i).not.toThrow();

      // bất biến CFG: mọi cạnh trỏ tới node tồn tại, không cạnh trùng
      const ids = new Set(g.nodes.map((n) => n.id));
      for (const e of g.edges) {
        if (!ids.has(e.from) || !ids.has(e.to)) throw new Error('cạnh treo ở seed ' + i);
      }
      const keys = g.edges.map((e) => [e.from, e.to, e.kind, e.elabel].join('|'));
      if (new Set(keys).size !== keys.length) throw new Error('cạnh trùng ở seed ' + i);
      totalNodes += g.nodes.length;

      // anchors không crash + tự khớp chính nó
      let anchors, ea;
      expect(() => {
        anchors = buildAnchors(g);
        ea = buildEdgeAnchors(g);
        const saved = anchors.map((a) => ({ ref: a.ref, kind: a.kind, lines: a.lines, skeleton: a.skeleton, skHash: a.skHash, ids: a.ids }));
        const m = matchBlocks(saved, anchors);
        const refMap = Object.fromEntries(anchors.map((a) => [a.ref, a.nodeId]));
        matchEdges(ea.map((e) => ({ ref: e.ref, from: 'B?', to: 'B?', kind: e.kind, label: e.elabel })), refMap, ea);
        if (Object.keys(m.byRef).length !== anchors.length) throw new Error('thiếu byRef ở seed ' + i);
      }, 'seed ' + i).not.toThrow();
      expect(anchors.length).toBe(g.nodes.length);
    }
    const ms = performance.now() - t0;
    // DoD T1: fuzz 5.000 chạy < 30s
    expect(ms).toBeLessThan(30000);
    expect(totalNodes).toBeGreaterThan(N); // trung bình > 1 node/hàm
     
    console.log(`fuzz 5000 hàm: ${ms.toFixed(0)}ms, tổng ${totalNodes} node`);
  }, 120000);
});
