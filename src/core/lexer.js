/* =========================================================================
 * PCODE Grapher · js/core/lexer.js — tokenizer cho C-pseudocode
 * Độc lập (không phụ thuộc file khác).
 * ========================================================================= */


/* ----------------------------- LEXER ---------------------------------- */

const MULTI_OPS = [
  '<<=', '>>=', '...', '->*', '<<', '>>', '<=', '>=', '==', '!=', '&&', '||',
  '++', '--', '->', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '::', '.*'
];

function lex(code) {
  // ln = số dòng của token (1-based). Parser dùng để báo "lỗi ở dòng N" và UI
  // dùng để tô dòng lỗi trong #lineNums (updateLineNumbers) — tính tăng dần trong
  // lúc lex nên O(n), không đếm lại chuỗi mỗi token.
  // Number literals also accept: ~.5~, ~1.~, ~0b1010~ and suffixes ULL/LL/Ul/L/F/Z/z
  // (Ghidra emits e.g. 0x1e7z / 0x10ULL). Order matters: hex/binary before decimal,
  // and a leading-dot decimal (~.5~) before the bare ~.~ operator.
  const re = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(\"(?:[^\"\\]|\\.)*\"|'(?:[^'\\]|\\.)*')|(0[xX][0-9a-fA-F][0-9a-fA-F_']*[uUlLzZ]*|0[bB][01][01_']*[uUlLzZ]*|\d[\d_']*(?:\.[\d_']*)?(?:[eE][+-]?\d+)?[uUlLfFzZ]*|\.\d[\d_']*(?:[eE][+-]?\d+)?[uUlLfFzZ]*)|([A-Za-z_][A-Za-z0-9_]*)|(\s+)|([\s\S])/g;
  const toks = [];
  let m;
  let line = 1, scanned = 0;
  const adv = (end) => {                     // đếm \n từ vị trí đã quét tới `end`
    const lim = Math.min(end, code.length);
    for (let i = scanned; i < lim; i++) if (code.charCodeAt(i) === 10) line++;
    if (lim > scanned) scanned = lim;
    return line;
  };
  while ((m = re.exec(code)) !== null) {
    // FIX(2): dòng của token = dòng BẮT ĐẦU. Trước đây push sau adv(re.lastIndex)
    // nên comment/chuỗi nhiều dòng nhận dòng KẾT THÚC → parser báo sai "dòng N"
    // và [l0,l1] của anchor bị kéo dãn (note bị đánh 'stale' oan).
    const startLine = adv(m.index);
    if (m[5]) { adv(re.lastIndex); continue; } // whitespace
    let t;
    if (m[1]) t = 'com';
    else if (m[2]) t = 'str';
    else if (m[3]) t = 'num';
    else if (m[4]) t = 'id';
    else t = 'op';
    let v = m[0];
    if (t === 'op') {
      // greedily merge multi-char operators
      const rest = code.slice(re.lastIndex);
      for (const mo of MULTI_OPS) {
        if (mo.startsWith(v) && rest.startsWith(mo.slice(1))) {
          v = mo;
          re.lastIndex += mo.length - 1;
          break;
        }
      }
    }
    adv(re.lastIndex);                         // phần tử nhiều dòng (/* */ "...")
    toks.push({ t, v, ln: startLine });
  }
  return toks;
}

export { lex, MULTI_OPS };
