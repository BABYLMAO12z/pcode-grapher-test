import { describe, it, expect } from 'vitest';
import { lex } from '../../src/core/lexer.js';

const kinds = (s) => lex(s).map((t) => t.t);
const vals = (s) => lex(s).map((t) => t.v);

describe('lexer — token class', () => {
  it('nhận diện đủ 5 lớp token: com/str/num/id/op', () => {
    const toks = lex('int a = 1; // hi\n"s" \'c\' /* b */');
    const set = new Set(toks.map((t) => t.t));
    expect(set.has('id')).toBe(true);
    expect(set.has('num')).toBe(true);
    expect(set.has('op')).toBe(true);
    expect(set.has('str')).toBe(true);
    expect(set.has('com')).toBe(true);
  });

  it('bỏ qua whitespace', () => {
    expect(kinds('  a   b  ')).toEqual(['id', 'id']);
  });

  it('comment 1 dòng và nhiều dòng đều là com', () => {
    expect(kinds('// x')).toEqual(['com']);
    expect(kinds('/* x\ny */')).toEqual(['com']);
  });

  it('chuỗi có escape không bị cắt sớm', () => {
    expect(vals('"a\\"b"')).toEqual(['"a\\"b"']);
    expect(vals("'\\0'")).toEqual(["'\\0'"]);
  });
});

describe('lexer — số', () => {
  it.each([
    ['0x1e7z', '0x1e7z'],
    ['0x10ULL', '0x10ULL'],
    ['0b1010', '0b1010'],
    ['.5', '.5'],
    ['1.', '1.'],
    ['1e-3', '1e-3'],
    ['0xdead', '0xdead'],
    ["1'000", "1'000"],
    ['1_000', '1_000'],
    ['3.5f', '3.5f'],
  ])('literal %s là 1 token num', (src, out) => {
    const t = lex(src);
    expect(t).toHaveLength(1);
    expect(t[0].t).toBe('num');
    expect(t[0].v).toBe(out);
  });

  it('.5 ưu tiên hơn toán tử "."', () => {
    expect(kinds('a.5')).toEqual(['id', 'num']);
  });
});

describe('lexer — toán tử nhiều ký tự', () => {
  it.each(['<<=', '>>=', '...', '->*', '<<', '>>', '<=', '>=', '==', '!=', '&&', '||',
    '++', '--', '->', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '::', '.*'])(
    'gộp %s thành 1 token', (op) => {
      const t = lex('a ' + op + ' b');
      expect(t.map((x) => x.v)).toEqual(['a', op, 'b']);
    }
  );

  it('không gộp sai khi ký tự đứng riêng', () => {
    expect(vals('a < b')).toEqual(['a', '<', 'b']);
    expect(vals('a & b')).toEqual(['a', '&', 'b']);
  });
});

describe('lexer — đếm dòng (ln)', () => {
  it('ln tăng theo dòng thật', () => {
    const t = lex('a\nb\n\nc');
    expect(t.map((x) => [x.v, x.ln])).toEqual([['a', 1], ['b', 2], ['c', 4]]);
  });

  // FIX(2): token nhiều dòng mang dòng BẮT ĐẦU (comment mở ở dòng 2), không phải
  // dòng kết thúc — parser báo "lỗi ở dòng N" và [l0,l1] của anchor mới đúng chỗ.
  // Bộ đếm vẫn phải đi hết token: 'b' nằm ở dòng 5.
  it('token nhiều dòng (block comment) mang dòng BẮT ĐẦU, bộ đếm vẫn đúng', () => {
    const t = lex('a\n/* x\ny\nz */\nb');
    expect(t[0].ln).toBe(1);
    expect(t[1].t).toBe('com');
    expect(t[1].ln).toBe(2);
    expect(t[2].v).toBe('b');
    expect(t[2].ln).toBe(5);
  });

  it('chuỗi nhiều dòng không làm lệch bộ đếm', () => {
    const t = lex('x\ny\nz');
    expect(t[2].ln).toBe(3);
  });

  it('O(n): 20.000 dòng lex nhanh', () => {
    const src = 'int a;\n'.repeat(20000);
    const t0 = performance.now();
    const t = lex(src);
    expect(performance.now() - t0).toBeLessThan(3000);
    expect(t[t.length - 1].ln).toBe(20000);
  });

  it('rỗng → mảng rỗng', () => {
    expect(lex('')).toEqual([]);
    expect(lex('   \n  ')).toEqual([]);
  });
});
