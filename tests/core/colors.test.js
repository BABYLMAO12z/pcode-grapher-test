import { describe, it, expect } from 'vitest';
import { lex } from '../../src/core/lexer.js';
import {
  KEYWORDS, TYPE_WORDS, VAR_COLOR, VAR_COLOR_LIGHT, VAR_PALETTE, VAR_PALETTE_LIGHT,
  isTypeWord, isAddrWord, isConstWord, isGhidraOp, varColor, classifyId,
} from '../../src/core/colors.js';

const cls = (src, i) => classifyId(lex(src), i);

describe('colors — bộ từ', () => {
  it('KEYWORDS chứa từ khoá C và mở rộng Ghidra/IDA', () => {
    for (const k of ['if', 'else', 'while', 'do', 'for', 'switch', 'case', 'goto',
      '__thiscall', '__fastcall', '__noreturn', 'NOINLINE']) {
      expect(KEYWORDS.has(k)).toBe(true);
    }
  });

  it('TYPE_WORDS chứa kiểu C, WinAPI và Qt', () => {
    for (const t of ['int', 'undefined', 'ulonglong', 'LPCWSTR', 'QString', 'shared_ptr']) {
      expect(TYPE_WORDS.has(t)).toBe(true);
    }
  });
});

describe('colors — vị từ phân loại', () => {
  it.each(['undefined', 'undefined8', 'uint32_t', 'int64_t', '__int64', '__uint128'])(
    'isTypeWord(%s) = true', (v) => expect(isTypeWord(v)).toBe(true));

  it.each(['FUN_140001000', 'DAT_1400abc', 'PTR_x', 'LAB_1', 's_hello', 'switchD_1', 'caseD_2', 'jpt_3'])(
    'isAddrWord(%s) = true', (v) => expect(isAddrWord(v)).toBe(true));

  it('isAddrWord KHÔNG bắt hằng UPPER_CASE bất kỳ', () => {
    expect(isAddrWord('MAX_BUF_SIZE')).toBe(false);
    expect(isAddrWord('__STDC__')).toBe(false);
  });

  it.each(['MAX', 'TRUE', 'MAX_BUF_SIZE', '__LINE__', '__STDC__'])(
    'isConstWord(%s) = true', (v) => expect(isConstWord(v)).toBe(true));

  it('isConstWord loại chữ 1 ký tự và Ghidra-op', () => {
    expect(isConstWord('A')).toBe(false);
    expect(isConstWord('_A_')).toBe(false);
    expect(isConstWord('CONCAT44')).toBe(false);
    expect(isConstWord('lowercase')).toBe(false);
  });

  it.each(['CONCAT44', 'SUB41', 'ZEXTEND814', 'SEXT', 'ZEXT', 'INT_ADD', 'FLOAT_MUL',
    'TRUNC32', 'POPCOUNT8', 'SBORROW4', 'CARRY4', 'SCARRY4', 'CARRYFROM', 'CAST',
    'SUBPIECE', 'PIECE', 'INSERT', 'EXTRACT', 'LZCOUNT', 'CPoolRef', 'NEW', 'DELETE'])(
    'isGhidraOp(%s) = true', (v) => expect(isGhidraOp(v)).toBe(true));

  it('isGhidraOp không bắt tên thường', () => {
    expect(isGhidraOp('concat')).toBe(false);
    expect(isGhidraOp('MAX')).toBe(false);
  });
});

describe('colors — varColor (v5: MỘT màu biến duy nhất, nhất quán category)', () => {
  it('ổn định cho cùng tên', () => {
    expect(varColor('local_138')).toBe(varColor('local_138'));
  });

  it('NHẤT QUÁN: 200 tên khác nhau đều CÙNG 1 màu (bỏ rainbow identity)', () => {
    const s = new Set();
    for (let i = 0; i < 200; i++) s.add(varColor('var_' + i));
    expect(s.size).toBe(1);
    expect(VAR_PALETTE).toContain(varColor('uVar13'));
    expect(varColor('uVar13')).toBe(VAR_COLOR);
  });

  it('VAR_PALETTE giữ 1 slot cho tương thích + khớp token --syn-var', () => {
    expect(VAR_PALETTE).toHaveLength(1);
    expect(VAR_PALETTE_LIGHT).toHaveLength(1);
    expect(VAR_PALETTE[0]).toBe(VAR_COLOR);
    expect(VAR_PALETTE_LIGHT[0]).toBe(VAR_COLOR_LIGHT);
    // khớp app.css :root{--syn-var} — nếu đổi màu biến phải đổi CẢ HAI nơi
    expect(VAR_COLOR).toBe('#8eccc4');        // dark v5 sky-teal categorical
    expect(VAR_COLOR_LIGHT).toBe('#001080');  // VSCode Light+ var/param
  });

  it('theme light đổi màu qua class trên <html>', () => {
    document.documentElement.classList.add('light');
    const light = varColor('abc');
    document.documentElement.classList.remove('light');
    const dark = varColor('abc');
    expect(light).toBe(VAR_COLOR_LIGHT);
    expect(dark).toBe(VAR_COLOR);
  });
});

describe('colors — classifyId', () => {
  it('kw trước mọi thứ', () => expect(cls('if (a)', 0)).toBe('kw'));
  it('Ghidra-op ưu tiên hơn "(" theo sau', () => expect(cls('CONCAT44(a,b)', 0)).toBe('gop'));
  it('type word', () => expect(cls('undefined8 x', 0)).toBe('ty'));
  it('address word', () => expect(cls('FUN_140001000()', 0)).toBe('addr'));
  it('id có "(" theo sau → fn', () => expect(cls('foo(1)', 0)).toBe('fn'));
  it('MAX(...) là fn, MAX trần là const', () => {
    expect(cls('MAX(1,2)', 0)).toBe('fn');
    expect(cls('x = MAX;', 2)).toBe('const');
  });
  it('CamelCase → ty', () => expect(cls('MyThing x', 0)).toBe('ty'));
  it('mặc định → var', () => expect(cls('local_138 = 1', 0)).toBe('var'));
  it('chỉ số ngoài phạm vi → op', () => {
    expect(classifyId(lex('a'), -1)).toBe('op');
    expect(classifyId(lex('a'), 99)).toBe('op');
    expect(classifyId(null, 0)).toBe('op');
  });
});
