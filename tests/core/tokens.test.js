import { describe, it, expect } from 'vitest';
import { lex } from '../../src/core/lexer.js';
import { esc, needSpace, renderToks, plainToks, lineHTML, lineClass, lineText, $ } from '../../src/ui/tokens.js';

describe('esc', () => {
  it('escape đủ & < > " \'', () => {
    expect(esc('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;');
  });
  it('null/undefined → chuỗi rỗng', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });
  it('chặn inject qua attribute data-key', () => {
    const html = renderToks(lex('a'), false).replace('a', '');
    expect(html).not.toContain('onerror');
    const evil = renderToks([{ t: 'id', v: 'x" onerror="alert(1)' }], false);
    expect(evil).not.toContain('onerror="alert');
    expect(evil).toContain('&quot;');
  });
});

describe('needSpace', () => {
  const T = (v, t = 'op') => ({ t, v });
  it('không thêm space trước ) ] ; ,', () => {
    for (const v of [')', ']', ';', ',']) expect(needSpace(null, T('a', 'id'), T(v))).toBe(false);
  });
  it('không thêm space sau ( [', () => {
    expect(needSpace(null, T('('), T('a', 'id'))).toBe(false);
    expect(needSpace(null, T('['), T('a', 'id'))).toBe(false);
  });
  it('lời gọi hàm: foo( không có space', () => {
    expect(needSpace(null, T('foo', 'id'), T('('))).toBe(false);
  });
  it('keyword có space trước (: if (', () => {
    expect(needSpace(null, T('if', 'id'), T('('))).toBe(true);
  });
  it('không có token trước → false', () => {
    expect(needSpace(null, null, T('a', 'id'))).toBe(false);
  });
});

describe('plainToks', () => {
  it('dựng lại câu lệnh đọc được', () => {
    expect(plainToks(lex('a=b+1;'))).toBe('a = b + 1;');
  });
  it('giữ nguyên gọi hàm không thừa space', () => {
    expect(plainToks(lex('foo(a,b)'))).toBe('foo(a, b)');
  });
  it('if giữ space', () => {
    expect(plainToks(lex('if(a==0)'))).toBe('if (a == 0)');
  });
  it('mảng rỗng → chuỗi rỗng', () => expect(plainToks([])).toBe(''));
});

describe('renderToks', () => {
  it('mỗi token là 1 span .tk có class đúng', () => {
    const html = renderToks(lex('if (FUN_1400() == 0) // c'), true);
    expect(html).toContain('class="tk kw"');
    expect(html).toContain('class="tk addr"');
    expect(html).toContain('class="tk num"');
    expect(html).toContain('class="tk com"');
    expect(html).toContain('class="tk op"');
  });

  it('biến có data-key và màu khi colorVars=true', () => {
    const on = renderToks(lex('local_138 = 1'), true);
    const off = renderToks(lex('local_138 = 1'), false);
    expect(on).toMatch(/class="tk var" data-key="local_138" style="color:#[0-9a-f]{6}"/);
    expect(off).toContain('class="tk var" data-key="local_138"');
    expect(off).not.toContain('style="color:');
  });

  it('chuỗi được escape', () => {
    expect(renderToks(lex('a = "<b>"'), false)).toContain('&lt;b&gt;');
  });
});

describe('lineHTML / lineClass / lineText', () => {
  it('dòng comment', () => {
    const L = { comment: '// hi' };
    expect(lineHTML(L, false)).toBe('<span class="tk com">// hi</span>');
    expect(lineClass(L, true)).toBe('ln ln-com');
    expect(lineText(L)).toBe('// hi');
  });

  it('dòng label', () => {
    const L = { text: 'LAB_1:' };
    expect(lineHTML(L, false)).toContain('class="tk lbl"');
    expect(lineClass(L, true)).toBe('ln ln-lbl');
    expect(lineText(L)).toBe('LAB_1:');
  });

  it('dòng lệnh có semi thêm ";"', () => {
    const L = { toks: lex('a = 1'), semi: true };
    expect(lineHTML(L, false)).toContain('>;</span>');
    expect(lineText(L)).toBe('a = 1;');
  });

  it('dòng ctl → ln ln-ctl-<kind>', () => {
    expect(lineClass({ ctl: 'if', toks: [] }, false)).toBe('ln ln-ctl ln-ctl-if');
    expect(lineClass({ ctl: 'while', toks: [] }, true)).toBe('ln ln-ctl ln-ctl-while');
  });

  it('dòng thường: ln-seq chỉ khi seqBg', () => {
    expect(lineClass({ toks: [] }, true)).toBe('ln ln-seq');
    expect(lineClass({ toks: [] }, false)).toBe('ln');
    expect(lineClass(null)).toBe('ln');
  });
});

describe('$ helper', () => {
  it('trả về element theo selector', () => {
    document.body.innerHTML = '<div id="x">hi</div>';
    expect($('#x').textContent).toBe('hi');
    expect($('#nope')).toBeNull();
  });
});
