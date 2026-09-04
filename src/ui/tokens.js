import { PcodeCore } from '../core/index.js';

/* =========================================================================
 * PCODE Grapher · js/ui/tokens.js — token list -> HTML có tô màu ($, esc, renderToks…)
 * Cần: js/core/colors.js (PcodeCore.classifyId/varColor).
 * ========================================================================= */


const $ = (s) => document.querySelector(s);

/* --------------------- token → styled HTML --------------------------- */

function esc(s) {
  // nháy kép PHẢI được escape: data-key="..." và value="..." nội suy thẳng vào
  // attribute, một identifier/đường dẫn chứa " sẽ đóng attribute sớm -> inject
  // được markup vào node / ô input.
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// decide if a space is needed between token a (with a's predecessor pp) and b
function needSpace(pp, a, b) {
  if (!a) return false;
  const A = a.v, B = b.v;
  if (/^\s/.test(B) || /\s$/.test(A)) return false;
  if (B === ')' || B === ']' || B === ';' || B === ',') return false;
  if (A === '(' || A === '[') return false;
  if (B === '(') {
    if (a.t === 'id' && !PcodeCore.KEYWORDS.has(A)) return false;   // call (  / cast (
    if (A === ')' || A === ']') return false;                        // )(
    return true;                                                     // if ( ...
  }
  if (B === '[') return false;
  if (A === ')' && (b.t === 'id' || b.t === 'num' || B === '(')) return false; // )x cast deref
  if (B === '.' || B === '->' || A === '.' || A === '->') return false;
  if (B === '::' || A === '::') return false;
  if (B === '++' || B === '--') return false;
  if (A === '++' || A === '--') return false;
  // unary * & ! ~ - +
  if ((A === '&' || A === '*' || A === '!' || A === '~' || A === '-' || A === '+') &&
      (pp == null || (pp.t === 'op' && pp.v !== ')' && pp.v !== ']' && pp.v !== '++' && pp.v !== '--'))) {
    return false;
  }
  if (B === '~' && A === '::') return false;
  return true;
}

function renderToks(toks, colorVars, liveNames) {
  let html = '';
  let pp = null, prev = null;
  for (let i = 0; i < toks.length; i++) {
    const tk = toks[i];
    const sp = needSpace(pp, prev, tk) ? ' ' : '';
    if (tk.t === 'com') html += sp + '<span class="tk com">' + esc(tk.v) + '</span>';
    else if (tk.t === 'str') html += sp + '<span class="tk str">' + esc(tk.v) + '</span>';
    else if (tk.t === 'num') html += sp + '<span class="tk num">' + esc(tk.v) + '</span>';
    else if (tk.t === 'id') {
      // D8/B2: đo phải dùng đúng TÊN HIỂN THỊ (tên live từ Ghidra) như CfgNode,
      // nếu không width đóng đinh theo tên cũ → chữ tràn khung sau rename.
      const shown = (liveNames && liveNames.get(tk.v)) || tk.v;
      const cls = PcodeCore.classifyId(toks, i);
      if (cls === 'var') {
        const style = colorVars ? ' style="color:' + PcodeCore.varColor(tk.v) + '"' : '';
        html += sp + '<span class="tk var" data-key="' + esc(tk.v) + '"' + style + '>' + esc(shown) + '</span>';
      } else {
        html += sp + '<span class="tk ' + cls + '" data-key="' + esc(tk.v) + '">' + esc(shown) + '</span>';
      }
    } else {
      html += sp + '<span class="tk op">' + esc(tk.v) + '</span>';
    }
    pp = prev; prev = tk;
  }
  return html;
}

function plainToks(toks) {
  let s = '', pp = null, prev = null;
  for (const tk of toks) {
    if (needSpace(pp, prev, tk)) s += ' ';
    s += tk.v;
    pp = prev; prev = tk;
  }
  return s.trim();
}

function lineHTML(line, colorVars, liveNames) {
  if (line.comment !== undefined) return '<span class="tk com">' + esc(line.comment) + '</span>';
  if (line.text !== undefined) return '<span class="tk lbl">' + esc(line.text) + '</span>';
  let h = renderToks(line.toks, colorVars, liveNames);
  if (line.semi) h += '<span class="tk op">;</span>';
  return h;
}

// Class nền từng DÒNG trong block (không đổi màu chữ):
//   ln-ctl  — if / else if / while / for / switch
//   ln-seq  — lệnh tuần tự CHỈ khi cùng block với một dòng ctl (prologue + if).
//             Thân then/else/loop giữ nền mặc định — nếu tô hết thì cả graph xanh ngọc.
//   ln-com / ln-lbl — comment / nhãn, không tô nền
// seqBg = block này có ít nhất 1 dòng ctl (truyền từ buildNodeEl).
function lineClass(line, seqBg) {
  if (!line) return 'ln';
  if (line.ctl) return 'ln ln-ctl ln-ctl-' + line.ctl;
  if (line.comment !== undefined) return 'ln ln-com';
  if (line.text !== undefined) return 'ln ln-lbl';
  return seqBg ? 'ln ln-seq' : 'ln';
}

function lineText(line) {
  if (line.comment !== undefined) return line.comment;
  if (line.text !== undefined) return line.text;
  return plainToks(line.toks) + (line.semi ? ';' : '');
}

export { $, esc, needSpace, renderToks, plainToks, lineHTML, lineClass, lineText };
