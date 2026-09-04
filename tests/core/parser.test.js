import { describe, it, expect } from 'vitest';
import { lex } from '../../src/core/lexer.js';
import { parseFunction, fnNameOf, Parser } from '../../src/core/parser.js';

const P = (src) => parseFunction(lex(src));
const kinds = (body) => body.map((s) => s.k);

describe('parser — hàm & header', () => {
  it('fnNameOf lấy id ngay trước "("', () => {
    const h = lex('void __thiscall ns::cls::check(longlong p1)');
    expect(fnNameOf(h)).toBe('check');
  });

  it('fnNameOf với header rỗng/null', () => {
    expect(fnNameOf(null)).toBe('');
    expect(fnNameOf([])).toBe('');
    expect(fnNameOf(lex('foo'))).toBe('foo');
  });

  it('hàm đơn giản: header + body', () => {
    const p = P('void f(void){ a = 1; }');
    expect(p.fn).toBe('f');
    expect(p.header).not.toBeNull();
    expect(kinds(p.body)).toEqual(['raw']);
    expect(p.errors).toEqual([]);
  });

  it('hàm rỗng: body rỗng, không lỗi', () => {
    const p = P('void f(void){}');
    expect(p.fn).toBe('f');
    expect(p.body).toEqual([]);
    expect(p.errors).toEqual([]);
  });

  it('hàm 2 tham số', () => {
    const p = P('int g(int a, char *b){ return a; }');
    expect(p.fn).toBe('g');
    expect(kinds(p.body)).toEqual(['return']);
  });

  it('nhiều hàm: hàm đầu chính, phần còn lại vào extras + extrasAt', () => {
    const p = P('void a(void){ x=1; }\nvoid b(void){ y=2; }\nvoid c(void){ z=3; }');
    expect(p.fn).toBe('a');
    expect(p.extras).toHaveLength(2);
    expect(p.extrasAt).toHaveLength(2);
    expect(p.extrasAt[0]).toBeGreaterThan(1);
  });

  it('code trần không có header vẫn parse được', () => {
    const p = P('{ a = 1; b = 2; }');
    expect(p.body.length).toBeGreaterThan(0);
  });
});

describe('parser — cấu trúc điều khiển', () => {
  it('if / else', () => {
    const p = P('void f(){ if (a) { b(); } else { c(); } }');
    const s = p.body[0];
    expect(s.k).toBe('if');
    expect(s.cond.map((t) => t.v)).toEqual(['a']);
    expect(s.then).toHaveLength(1);
    expect(s.els).toHaveLength(1);
  });

  it('else-if lồng nhau', () => {
    const p = P('void f(){ if(a){x();} else if(b){y();} else {z();} }');
    const s = p.body[0];
    expect(s.els[0].k).toBe('if');
    expect(s.els[0].els).toHaveLength(1);
  });

  it('while', () => {
    const p = P('void f(){ while (i < 10) { i = i + 1; } }');
    expect(p.body[0].k).toBe('while');
    expect(p.body[0].body).toHaveLength(1);
  });

  it('do-while đầy đủ', () => {
    const p = P('void f(){ do { i--; } while (i != 0); }');
    const s = p.body[0];
    expect(s.k).toBe('dowhile');
    expect(s.cond.map((t) => t.v)).toEqual(['i', '!=', '0']);
    expect(p.errors).toEqual([]);
  });

  it('do KHÔNG có while → cond rỗng, vẫn là dowhile', () => {
    const p = P('void f(){ do { i--; } }');
    expect(p.body[0].k).toBe('dowhile');
    expect(p.body[0].cond).toEqual([]);
  });

  it('for 3 phần tách đúng init/cond/incr', () => {
    const p = P('void f(){ for (i = 0; i < 3; i = i + 1) { g(); } }');
    const s = p.body[0];
    expect(s.k).toBe('for');
    expect(s.init.map((t) => t.v)).toEqual(['i', '=', '0']);
    expect(s.cond.map((t) => t.v)).toEqual(['i', '<', '3']);
    expect(s.incr.map((t) => t.v)).toEqual(['i', '=', 'i', '+', '1']);
  });

  it('for(;;) — 3 phần rỗng', () => {
    const p = P('void f(){ for (;;) { g(); } }');
    const s = p.body[0];
    expect(s.init).toEqual([]);
    expect(s.cond).toEqual([]);
    expect(s.incr).toEqual([]);
  });

  it('for có ";" trong lời gọi lồng vẫn không vỡ', () => {
    const p = P('void f(){ for (i = h(1,2); i < n; i++) { g(); } }');
    expect(p.body[0].cond.map((t) => t.v)).toEqual(['i', '<', 'n']);
  });

  it('switch: case, case-nhóm, default', () => {
    const p = P('void f(){ switch (x) { case 0: a(); break; case 1: case 2: b(); break; default: c(); } }');
    const s = p.body[0];
    expect(s.k).toBe('switch');
    expect(s.cases).toHaveLength(4);
    expect(s.cases[3].label).toBeNull();
    expect(s.cases[1].body).toEqual([]);
  });

  it('statement TRƯỚC case đầu tiên → gom vào case "(pre)"', () => {
    const p = P('void f(){ switch (x) { y = 1; case 0: a(); } }');
    const s = p.body[0];
    expect(s.cases[0].label[0].v).toBe('(pre)');
    expect(s.cases[0].body[0].k).toBe('raw');
    expect(s.cases[1].label.map((t) => t.v)).toEqual(['0']);
  });

  it('goto + label', () => {
    const p = P('void f(){ goto LAB_1; LAB_1: a(); }');
    expect(p.body[0]).toMatchObject({ k: 'goto', name: 'LAB_1' });
    expect(p.body[1]).toMatchObject({ k: 'label', name: 'LAB_1' });
  });

  it('goto không tên → "(?)"', () => {
    const p = P('void f(){ goto ; }');
    expect(p.body[0]).toMatchObject({ k: 'goto', name: '(?)' });
  });

  it('case lạc ngoài switch → label', () => {
    const p = P('void f(){ case 3: a(); }');
    expect(p.body[0].k).toBe('label');
    expect(p.body[0].name).toContain('case');
  });

  it('"::" không bị nhầm là label', () => {
    const p = P('void f(){ ns::g(); }');
    expect(p.body[0].k).toBe('raw');
  });

  it('return / break / continue', () => {
    const p = P('void f(){ while(1){ break; continue; } return 0; }');
    expect(kinds(p.body[0].body)).toEqual(['break', 'continue']);
    expect(p.body[1].k).toBe('return');
    expect(p.body[1].toks.map((t) => t.v)).toEqual(['0']);
  });

  it('comment thành statement k=com', () => {
    const p = P('void f(){ // hi\n a(); }');
    expect(kinds(p.body)).toEqual(['com', 'raw']);
  });

  it('dòng preprocessor "#..."', () => {
    const p = P('void f(){ #pragma once\n }');
    expect(p.body[0].k).toBe('raw');
  });

  it('lệnh >80 ký tự không bị cắt', () => {
    const long = 'x = ' + Array.from({ length: 40 }, (_, i) => 'v' + i).join(' + ') + ';';
    expect(long.length).toBeGreaterThan(80);
    const p = P('void f(){ ' + long + ' }');
    expect(p.body[0].k).toBe('raw');
    expect(p.body[0].toks.length).toBeGreaterThan(40);
  });
});

describe('parser — lỗi & guard', () => {
  it('thiếu } → báo "missing }"', () => {
    const p = P('void f(){ if (a) { b();  ');
    expect(p.errors.join(' ')).toContain('missing }');
  });

  it('errLine trỏ đúng dòng đầu tiên có lỗi và errors có "(dòng N)"', () => {
    const p = P('void f(){\n  if (a) {\n    b();\n');
    expect(p.errLine).toBeGreaterThan(0);
    expect(p.errors[0]).toMatch(/dòng \d+/);
  });

  it('errors cap ở 32', () => {
    const p = new Parser(lex('a'));
    for (let i = 0; i < 100; i++) p.err('e' + i);
    expect(p.errors).toHaveLength(32);
  });

  it('while thiếu "(" → báo expected (', () => {
    const p = P('void f(){ while a > 1 { b(); } }');
    expect(p.errors.join(' ')).toMatch(/expected \(/);
  });

  it('parser luôn tiến (không treo) với rác', () => {
    const p = P('void f(){ @@@ ??? ;;; }');
    expect(Array.isArray(p.body)).toBe(true);
  });

  it('input rỗng → body rỗng, không ném lỗi', () => {
    const p = P('');
    expect(p.body).toEqual([]);
    expect(p.fn).toBe('');
  });

  it('hàm rất lớn: guard 30000 statement báo lỗi, không treo', () => {
    const p = P('void f(){\n' + 'a();\n'.repeat(30050) + '}');
    expect(p.errors.join(' ')).toContain('30000');
  });
});
