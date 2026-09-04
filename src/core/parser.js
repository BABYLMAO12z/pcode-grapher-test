/* =========================================================================
 * PCODE Grapher · js/core/parser.js — recursive-descent parser -> AST statements
 * Cần: lexer.js (lex không bắt buộc; nhận token list truyền vào).
 * ========================================================================= */


/* --------------------------- PARSER (AST) ------------------------------ */

// Stmt kinds: raw, com, block, if, while, dowhile, for, switch, return,
//             break, continue, goto, label
function Parser(toks) {
  this.t = toks;
  this.i = 0;
  this.errors = [];
}
Parser.prototype.errLine = 0;
Parser.prototype.peek = function (o) { return this.t[this.i + (o || 0)]; };
Parser.prototype.next = function () { return this.t[this.i++]; };
Parser.prototype.eof = function () { return this.i >= this.t.length; };
Parser.prototype.err = function (msg) {
  // Trước đây cap 8 lỗi và message không có vị trí -> người dùng chỉ thấy
  // "statement overflow" mà không biết lỗi ở đâu trong 4000 dòng pseudocode.
  if (this.errors.length >= 32) return;
  const tk = this.t[this.i] || this.t[this.t.length - 1];
  const ln = tk && tk.ln ? tk.ln : 0;
  this.errors.push(msg + (ln ? ' (dòng ' + ln + ')' : ''));
  if (!this.errLine && ln) this.errLine = ln;
};

Parser.prototype.isOp = function (v, o) { const k = this.peek(o || 0); return k && k.t === 'op' && k.v === v; };
Parser.prototype.isId = function (v, o) { const k = this.peek(o || 0); return k && k.t === 'id' && (!v || k.v === v); };
Parser.prototype.eat = function (v) { if (this.isOp(v)) { this.i++; return true; } return false; };

// collect tokens until ';' at nesting depth 0 (tracks () [] {} and comment)
Parser.prototype.collectSemi = function () {
  const out = [];
  let d = 0, guard = 0;
  while (!this.eof()) {
    if (++guard > 80000) { this.err('dừng tìm ";" sau 80000 token (thiếu ; hoặc expression quá dài)'); break; }
    const k = this.peek();
    if (k.t === 'com') { out.push(this.next()); continue; }
    if (k.t === 'op') {
      if (k.v === ';' && d === 0) { this.i++; return { toks: out, ended: true }; }
      if (k.v === '}' && d === 0) return { toks: out, ended: false };
      if (k.v === '(' || k.v === '[' || k.v === '{') d++;
      // FIX(14): KHÔNG cho depth âm. Một dấu đóng thừa (pseudocode Ghidra cắt dở,
      // macro hỏng) làm d = -1 → điều kiện `;` && d === 0 KHÔNG BAO GIỜ đúng nữa
      // → cả phần còn lại của hàm bị nuốt vào MỘT statement raw (đo được: 4 lệnh
      // → 1). Kẹp về 0 để lỗi chỉ ảnh hưởng đúng câu lệnh chứa nó.
      if (k.v === ')' || k.v === ']' || k.v === '}') d = Math.max(0, d - 1);
    }
    out.push(this.next());
  }
  return { toks: out, ended: false };
};

// collect tokens of a parenthesised group, consuming ( ... )
Parser.prototype.parenGroup = function () {
  const out = [];
  if (!this.eat('(')) { this.err('expected ( @' + this.i); return out; }
  let depth = 1, guard = 0;
  while (!this.eof() && depth > 0) {
    if (++guard > 80000) { this.err('dấu ngoặc "(" không đóng trong 80000 token'); break; }
    const k = this.next();
    if (k.t === 'com') { out.push(k); continue; }
    if (k.t === 'op') {
      if (k.v === '(') depth++;
      if (k.v === ')') { depth--; if (depth === 0) break; }
    }
    out.push(k);
  }
  return out;
};

Parser.prototype.parseBlock = function () {
  // assumes current token is '{'
  this.eat('{');
  const body = this.parseStatements(() => this.isOp('}'));
  if (!this.eat('}')) this.err('missing }');
  return body;
};

// stopFn() returns true when statement parsing should stop (not consuming)
Parser.prototype.parseStatements = function (stopFn) {
  const list = [];
  let guard = 0;
  while (!this.eof() && !stopFn()) {
    if (++guard > 30000) { this.err('hàm quá lớn: dừng ở 30000 câu lệnh, sơ đồ CHƯA vẽ hết'); break; }
    const before = this.i;
    const s = this.parseStatement();
    if (s) list.push(s);
    if (this.i === before) { this.next(); } // always progress
  }
  return list;
};

Parser.prototype.stmtOrBlock = function () {
  if (this.isOp('{')) return this.parseBlock();
  const s = this.parseStatement();
  return s ? [s] : [];
};

Parser.prototype.parseStatement = function () {
  const k = this.peek();
  if (!k) return null;
  if (k.t === 'com') { this.i++; return { k: 'com', v: k.v, ln: k.ln }; }
  if (k.t === 'op') {
    if (k.v === ';') { this.i++; return null; }
    if (k.v === '{') return { k: 'block', body: this.parseBlock() };
    if (k.v === '#') { // preprocessor-ish line: eat till ';' or '}'
      const r = this.collectSemi();
      return { k: 'raw', toks: [k].concat(r.toks) };
    }
    const r = this.collectSemi();
    return { k: 'raw', toks: r.toks };
  }
  if (k.t === 'id') {
    switch (k.v) {
      case 'if': {
        this.i++;
        const cond = this.parenGroup();
        const then = this.stmtOrBlock();
        let els = null;
        if (this.isId('else')) { this.i++; els = this.stmtOrBlock(); }
        return { k: 'if', cond, then, els };
      }
      case 'while': {
        this.i++;
        const cond = this.parenGroup();
        const body = this.stmtOrBlock();
        return { k: 'while', cond, body };
      }
      case 'do': {
        this.i++;
        const body = this.stmtOrBlock();
        let cond = [];
        if (this.isId('while')) { this.i++; cond = this.parenGroup(); this.eat(';'); }
        return { k: 'dowhile', cond, body };
      }
      case 'for': {
        this.i++;
        let init = [], cond = [], incr = [];
        if (this.eat('(')) {
          let d = 1, guard = 0, cur = init;
          while (!this.eof() && d > 0) {
            if (++guard > 20000) break;
            const tk = this.next();
            if (tk.t === 'op' && tk.v === '(') { d++; cur.push(tk); continue; }
            if (tk.t === 'op' && tk.v === ')') { d--; if (d === 0) break; cur.push(tk); continue; }
            if (tk.t === 'op' && tk.v === ';' && d === 1) { cur = (cur === init) ? cond : incr; continue; }
            cur.push(tk);
          }
        }
        const body = this.stmtOrBlock();
        return { k: 'for', init, cond, incr, body };
      }
      case 'switch': {
        this.i++;
        const expr = this.parenGroup();
        const cases = [];
        if (this.eat('{')) {
          let guard = 0;
          while (!this.eof() && !this.isOp('}')) {
            if (++guard > 10000) { this.err('switch có >10000 nhánh case — phần còn lại bị bỏ qua'); break; }
            if (this.isId('case')) {
              this.i++;
              const lbl = [];
              while (!this.eof() && !this.isOp(':')) lbl.push(this.next());
              this.eat(':');
              const body = this.parseStatements(() => this.isId('case') || this.isId('default') || this.isOp('}'));
              cases.push({ label: lbl, body });
            } else if (this.isId('default')) {
              this.i++; this.eat(':');
              const body = this.parseStatements(() => this.isId('case') || this.isId('default') || this.isOp('}'));
              cases.push({ label: null, body });
            } else {
              const before = this.i;
              const junk = this.parseStatement();
              // FIX(13): MỌI câu lệnh đứng trước `case` đầu tiên (hoặc lọt giữa
              // hai case) phải được giữ. Bản cũ chỉ nhận k === 'raw' nên một
              // `if`/`while`/comment ở đó bị XOÁ IM LẶNG khỏi cả AST lẫn CFG
              // (đo được: switch{ if(x){g();} case 1: … } mất hẳn lời gọi g()).
              if (junk) {
                const pre = cases.length && cases[cases.length - 1].pre
                  ? cases[cases.length - 1]
                  : (cases.push({ label: [{ t: 'str', v: '(pre)' }], body: [], pre: true }),
                    cases[cases.length - 1]);
                pre.body.push(junk);
              }
              if (this.i === before) this.next();
            }
          }
          this.eat('}');
        }
        return { k: 'switch', expr, cases };
      }
      case 'return': case 'break': case 'continue': {
        this.i++;
        const r = this.collectSemi();
        return { k: k.v, toks: r.toks };
      }
      case 'goto': {
        this.i++;
        let name = '(?)';
        if (this.isId()) { name = this.next().v; }
        this.eat(';');
        return { k: 'goto', name };
      }
      case 'case': case 'default': {
        // stray case label outside switch — render as label
        const lbl = [this.next()];
        while (!this.eof() && !this.isOp(':') && !this.isOp(';')) lbl.push(this.next());
        this.eat(':');
        return { k: 'label', name: lbl.map(x => x.v).join(' '), ln: lbl[0] ? lbl[0].ln : 0 };
      }
      default: {
        // label?
        if (this.isOp(':', 1) && !this.isOp('::', 1)) {
          const name = k.v;
          this.i += 2;
          return { k: 'label', name, ln: k.ln };
        }
        const r = this.collectSemi();
        return { k: 'raw', toks: r.toks };
      }
    }
  }
  // numbers/strings starting a statement — just raw
  const r = this.collectSemi();
  return { k: 'raw', toks: [k].concat(r.toks.slice(0)) };
};

// Top-level: parse all functions, return first with body + list of extras.
function parseFunction(toks) {
  const p = new Parser(toks);
  let first = null;
  const extras = [];
  while (!p.eof()) {
    // skip leading comments/whitespace already consumed by parser
    const k = p.peek();
    if (!k) break;
    // find next '{' to detect function start
    let brace = -1;
    for (let j = p.i; j < p.t.length; j++) {
      if (p.t[j].t === 'op' && p.t[j].v === '{') { brace = j; break; }
    }
    if (brace < 0) break;
    const before = p.t.slice(p.i, brace);
    const hasSemi = before.some(x => x.t === 'op' && x.v === ';');
    const hasParen = before.some(x => x.t === 'op' && x.v === ')');
    const hasCom = before.some(x => x.t === 'com');
    const header = (!hasSemi && (hasParen || !hasCom)) ? before : null;
    if (header) {
      p.i = brace;
      const body = p.parseBlock();
      const fn = { header, body };
      if (!first) first = fn; else extras.push(fn);
    } else {
      // bare statements before next function
      const body = p.parseStatements(() => {
        const pk = p.peek();
        if (!pk) return true;
        // stop if next non-comment token suggests a function header
        let nextBrace = -1;
        for (let j = p.i; j < p.t.length; j++) {
          if (p.t[j].t === 'op' && p.t[j].v === '{') { nextBrace = j; break; }
        }
        if (nextBrace < 0) return true;
        const b = p.t.slice(p.i, nextBrace);
        const hp = b.some(x => x.t === 'op' && x.v === ')');
        const hs = b.some(x => x.t === 'op' && x.v === ';');
        return !hs && hp;
      });
      if (!first) first = { header: null, body };
      else extras.push({ header: null, body });
    }
  }
  if (!first) first = { header: null, body: [] };
  return {
    header: first.header, body: first.body, extras, errors: p.errors,
    errLine: p.errLine || 0,
    fn: fnNameOf(first.header),
    // số dòng của stmt ĐẦU TIÊN mỗi hàm phụ — để UI báo "còn N hàm nữa ở dòng ..."
    extrasAt: extras.map(f => {
      const t0 = f.header && f.header.length ? f.header[0] : null;
      return t0 && t0.ln ? t0.ln : 0;
    })
  };
}

/* "void __thiscall ns::cls::check(longlong p1)" -> "check".
 * FIX(27): lấy id đứng trước dấu "(" CUỐI CÙNG ở ĐỘ SÂU 0, không phải dấu "("
 * đầu tiên. Header có con trỏ hàm hoặc macro gọi hàm — "void (*cb)(int) foo(x)",
 * "__declspec(dllexport) int run(void)" — trước đây trả sai tên ('cb' / rỗng),
 * kéo theo fnKey sai ⇒ notes đã lưu của hàm không được nhận ra. */
function fnNameOf(header) {
  if (!header || !header.length) return '';
  let depth = 0, name = '';
  for (let i = 0; i < header.length; i++) {
    const t = header[i];
    if (t.t === 'op') {
      if (t.v === '(' || t.v === '[') { depth++; continue; }
      if (t.v === ')' || t.v === ']') { depth = Math.max(0, depth - 1); continue; }
      continue;
    }
    if (depth !== 0) continue;
    const nx = header[i + 1];
    if (t.t === 'id' && nx && nx.t === 'op' && nx.v === '(') name = t.v; // giữ cái CUỐI
  }
  if (name) return name;
  const last = header[header.length - 1];
  return (last && last.t === 'id') ? last.v : '';
}

export { Parser, parseFunction, fnNameOf };
