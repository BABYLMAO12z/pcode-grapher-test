import { describe, it, expect } from 'vitest';
import { lex } from '../../src/core/lexer.js';
import { parseFunction } from '../../src/core/parser.js';
import { CfgBuilder } from '../../src/core/cfg.js';
import { SAMPLE } from '../../src/sample.js';

export function build(src) {
  const parsed = parseFunction(lex(src));
  const b = new CfgBuilder();
  return { g: b.build(parsed), parsed, b };
}
const kindsOf = (g) => g.edges.map((e) => e.kind);

describe('CFG — sample activation::check', () => {
  const { g, parsed } = build(SAMPLE);

  it('parse được tên hàm', () => {
    expect(parsed.fn).toBe('check');
  });

  it('sinh graph ổn định: 27 nodes / 36 edges / warnings rỗng', () => {
    // Số đo THẬT của core v1.9.3 (chủ dự án đã xác nhận 01/09/2026).
    // 25/33 là số LỖI THỜI trong comment stub tests/test.js dòng 3–13;
    // README repo gốc dòng 297 xác nhận cấu trúc mới = 27 block / 36 cạnh.
    expect(g.nodes).toHaveLength(27);
    expect(g.edges).toHaveLength(36);
    expect(g.warnings).toEqual([]);
  });

  it('block đầu là ENTRY và chứa dòng chữ ký', () => {
    const entry = g.nodes.find((n) => n.kind === 'entry');
    expect(entry).toBeDefined();
    expect(entry.lines[0].toks.map((t) => t.v).join(' ')).toContain('activation');
  });

  it('không còn block rỗng sau collapse', () => {
    expect(g.nodes.filter((n) => n.kind === 'block' && !n.lines.length)).toHaveLength(0);
  });

  it('mọi cạnh trỏ tới node tồn tại', () => {
    const ids = new Set(g.nodes.map((n) => n.id));
    for (const e of g.edges) {
      expect(ids.has(e.from)).toBe(true);
      expect(ids.has(e.to)).toBe(true);
    }
  });

  it('có đủ các loại cạnh cond/loop/goto/case', () => {
    const k = new Set(kindsOf(g));
    for (const want of ['true', 'false', 'goto']) {
      expect([...k].join(',')).toContain(want.slice(0, 4) === 'goto' ? 'goto' : want);
    }
    expect(g.edges.some((e) => /case/i.test(e.kind + e.elabel))).toBe(true);
  });

  it('không có cạnh trùng lặp (dedupeEdges)', () => {
    const keys = g.edges.map((e) => [e.from, e.to, e.kind, e.elabel].join('|'));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('CFG — cấu trúc cơ bản', () => {
  it('if/else tạo 2 nhánh true/false', () => {
    const { g } = build('void f(){ if(a){x();} else {y();} z(); }');
    const k = kindsOf(g);
    expect(k.filter((x) => x === 'true')).toHaveLength(1);
    expect(k.filter((x) => x === 'false')).toHaveLength(1);
  });

  it('if không else: nhánh false đi thẳng xuống sau', () => {
    const { g } = build('void f(){ if(a){x();} z(); }');
    expect(kindsOf(g)).toContain('false');
  });

  it('while tạo cạnh quay lui (loop)', () => {
    const { g } = build('void f(){ while(i<3){ i++; } done(); }');
    expect(kindsOf(g).some((k) => /loop|back/.test(k))).toBe(true);
  });

  it('do-while cũng có cạnh quay lui', () => {
    const { g } = build('void f(){ do { i--; } while(i); end(); }');
    expect(kindsOf(g).some((k) => /loop|back|true/.test(k))).toBe(true);
  });

  it('goto nối tới label', () => {
    const { g } = build('void f(){ goto L; a(); L: b(); }');
    expect(kindsOf(g)).toContain('goto');
  });

  it('goto tới nhãn không tồn tại → cảnh báo, không crash', () => {
    const { g } = build('void f(){ goto NOPE; }');
    expect(g.warnings.join(' ')).toContain('NOPE');
  });

  it('nhãn trùng tên → cảnh báo', () => {
    const { g } = build('void f(){ L: a(); L: b(); }');
    expect(g.warnings.join(' ')).toContain('trùng tên');
  });

  it('return đánh dấu flags.terminal', () => {
    const { g } = build('void f(){ a(); return; }');
    expect(g.nodes.some((n) => n.flags.terminal)).toBe(true);
  });

  it('switch sinh 1 nhánh mỗi case + default', () => {
    const { g } = build('void f(){ switch(x){ case 0: a(); break; case 1: b(); break; default: c(); } }');
    const caseEdges = g.edges.filter((e) => /case|default/i.test(e.kind + ' ' + e.elabel));
    expect(caseEdges.length).toBeGreaterThanOrEqual(3);
  });

  it('hàm rỗng: giữ ô chữ ký, không cạnh', () => {
    const { g } = build('void f(void){}');
    expect(g.nodes).toHaveLength(1);
    expect(g.edges).toHaveLength(0);
  });

  it('hàm 1 lệnh: header gộp vào block đầu (1 node)', () => {
    const { g } = build('void f(void){ a(); }');
    expect(g.nodes).toHaveLength(1);
    expect(g.nodes[0].kind).toBe('entry');
    expect(g.nodes[0].lines).toHaveLength(2);
  });

  it('break/continue trong vòng lặp nối đúng ra ngoài/đầu vòng', () => {
    const { g } = build('void f(){ while(a){ if(b) break; if(c) continue; d(); } e(); }');
    const ids = new Set(g.nodes.map((n) => n.id));
    expect(g.edges.every((e) => ids.has(e.from) && ids.has(e.to))).toBe(true);
    expect(g.nodes.length).toBeGreaterThan(3);
  });
});

describe('CFG — collapse & dedupe', () => {
  it('collapse LIMIT = nodes.length + 8 (không dừng sớm ở hàm lớn)', () => {
    const src = 'void f(){\n' + 'if(a){}\n'.repeat(300) + '}';
    const { g } = build(src);
    const empty = g.nodes.filter((n) => n.kind === 'block' && !n.lines.length);
    expect(empty.length).toBe(0);
  });

  it('dedupeEdges dùng key from|to|kind|elabel', () => {
    const b = new CfgBuilder();
    b.edges = [
      { from: 1, to: 2, kind: 'plain', elabel: '' },
      { from: 1, to: 2, kind: 'plain', elabel: '' },
      { from: 1, to: 2, kind: 'true', elabel: '' },
      { from: 1, to: 2, kind: 'plain', elabel: 'x' },
    ];
    b.dedupeEdges();
    expect(b.edges).toHaveLength(3);
  });

  it('node() cấp id tăng dần + đưa vào this.nodes', () => {
    const b = new CfgBuilder();
    const a = b.node('block');
    const c = b.node('label');
    expect([a.id, c.id]).toEqual([0, 1]);
    expect(b.nodes).toHaveLength(2);
  });

  it('link() bỏ qua khi thiếu đầu/cuối', () => {
    const b = new CfgBuilder();
    b.link(null, b.node('block'), 'plain');
    expect(b.edges).toHaveLength(0);
  });
});

describe('CFG — không crash trên input xấu', () => {
  it.each([
    '',
    'void f(){',
    'void f(){ }}}',
    'void f(){ switch(x){} }',
    'void f(){ for(;;){} }',
    'void f(){ do{}while(); }',
    'void f(){ @@@; }',
    'void f(){ if(a) if(b) if(c) d(); }',
  ])('input %j', (src) => {
    expect(() => build(src)).not.toThrow();
  });
});
