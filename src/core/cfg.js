/* =========================================================================
 * PCODE Grapher · js/core/cfg.js — CfgBuilder: dựng control-flow graph từ AST
 * Cần: parser.js (AST shape).
 * ========================================================================= */


/* ------------------------- CFG CONSTRUCTION ---------------------------- */

function CfgBuilder() {
  this.nodes = [];
  this.edges = [];
  /* FIX(15): bảng nhãn PHẢI không có prototype. Với `{}` thì một nhãn tên
   * 'toString'/'constructor'/'valueOf' (Ghidra sinh nhãn từ symbol) khiến
   * this.labels[name] trả về HÀM kế thừa từ Object.prototype: goto tới nhãn
   * KHÔNG tồn tại vẫn "tìm thấy" → link(from, Function) → edge {to: undefined}
   * (React Flow bỏ edge, không cảnh báo gì), còn nhãn có thật thì bị báo
   * "trùng tên" oan. */
  this.labels = Object.create(null);
  this.gotos = [];
  this.nid = 0;
  this.warnings = [];
}
CfgBuilder.prototype.node = function (kind) {
  const n = { id: this.nid++, kind, lines: [], flags: {} };
  this.nodes.push(n);
  return n;
};
CfgBuilder.prototype.link = function (from, to, kind, elabel) {
  if (!from || !to) return;
  this.edges.push({ from: from.id, to: to.id, kind: kind || 'plain', elabel: elabel || '' });
};
CfgBuilder.prototype.linkOpen = function (open, to, forceKind) {
  for (const o of open) this.link(o.n, to, forceKind || o.k, o.elabel);
};

function kwTok(v) { return { t: 'id', v }; }
function opTok(v) { return { t: 'op', v }; }

// st = { open: [{n, k, elabel}], pending }
CfgBuilder.prototype.buildSeq = function (list, st, ctx) {
  const self = this;
  const ensure = function () {
    if (!st.pending) {
      st.pending = self.node('block');
      self.linkOpen(st.open, st.pending);
      st.open = [{ n: st.pending, k: 'plain' }];
    }
    return st.pending;
  };

  for (const s of list) {
    switch (s.k) {
      case 'raw':
        ensure().lines.push({ toks: s.toks, semi: true });
        break;
      case 'com':
        ensure().lines.push({ comment: s.v, ln: s.ln });
        break;
      case 'block':
        this.buildSeq(s.body, st, ctx);
        break;
      case 'label': {
        st.pending = null;
        const ln = this.node('label');
        ln.lines.push({ text: s.name + ':', ln: s.ln });
        this.linkOpen(st.open, ln);
        st.open = [{ n: ln, k: 'plain' }];
        // FIX(15b): nhãn trùng tên → GIỮ nhãn ĐẦU TIÊN (mọi goto trong C trỏ tới
        // một nhãn duy nhất; ghi đè bằng nhãn cuối làm mũi tên goto nhảy sai chỗ
        // và nhãn đầu mất hết cạnh vào).
        if (this.labels[s.name]) this.warnings.push("nhãn trùng tên '" + s.name + "' — goto dùng nhãn đầu tiên");
        else this.labels[s.name] = ln;
        break;
      }
      case 'goto': {
        const p = ensure();
        p.lines.push({ toks: [kwTok('goto'), kwTok(s.name)], semi: true });
        this.gotos.push({ from: p, name: s.name });
        st.open = []; st.pending = null;
        break;
      }
      case 'return': {
        const p = ensure();
        p.lines.push({ toks: [kwTok('return')].concat(s.toks || []), semi: true });
        p.flags.terminal = true;
        st.open = []; st.pending = null;
        break;
      }
      case 'break': {
        const p = ensure();
        p.lines.push({ toks: [kwTok('break')], semi: true });
        if (ctx.breaks.length) ctx.breaks[ctx.breaks.length - 1].push(p);
        else { this.gotos.push({ from: p, name: null }); this.warnings.push('break ngoài vòng lặp/switch'); }
        st.open = []; st.pending = null;
        break;
      }
      case 'continue': {
        const p = ensure();
        p.lines.push({ toks: [kwTok('continue')], semi: true });
        if (ctx.conts.length) this.link(p, ctx.conts[ctx.conts.length - 1], 'loop');
        else this.warnings.push('continue ngoài vòng lặp');
        st.open = []; st.pending = null;
        break;
      }
      case 'if': {
        // if condition nằm ở CUỐI block hiện tại (không tách riêng).
        // ctl đánh dấu dòng điều khiển để UI tô nền khác với lệnh tuần tự
        // trong CÙNG block (prologue + if vẫn 1 box).
        const p = ensure();
        p.lines.push({ toks: [kwTok('if'), opTok(' (')].concat(s.cond).concat([opTok(')')]), ctl: 'if' });
        const th = this.buildSeq(s.then, { open: [{ n: p, k: 'true' }], pending: null }, ctx);
        if (s.els) {
          // Parser trả về els = stmtOrBlock() → luôn là array.
          // Nếu array chứa đúng 1 stmt k==='if' → đó là else-if.
          const elsNode = (Array.isArray(s.els) && s.els.length === 1) ? s.els[0] : s.els;
          if (elsNode.k === 'if') {
            // ELSE-IF: dòng "else if (...)" nằm ở block đầu của else branch,
            // không tách node cond riêng, không đẩy lên top block.
            const e = self.ensureElseIfSeq(elsNode, p, ctx);
            st.open = th.open.concat(e.open);
          } else {
            const el = this.buildSeq(s.els, { open: [{ n: p, k: 'false' }], pending: null }, ctx);
            st.open = th.open.concat(el.open);
          }
        } else {
          // Không có else: LUÔN phát hành nhánh false tới continuation.
          // (Trước đây `st.open = th.open` làm mất nhánh false khi then-branch
          //  return/break/continue/goto → th.open rỗng → các block sau guard
          //  clause trở thành node mồ côi, không có cạnh vào.)
          st.open = th.open.concat([{ n: p, k: 'false' }]);
        }
        st.pending = null;
        break;
      }
      case 'while': {
        st.pending = null;
        const c = this.node('cond');
        c.ctag = 'while';
        c.lines.push({ toks: [kwTok('while'), opTok(' (')].concat(s.cond).concat([opTok(')')]), ctl: 'while' });
        this.linkOpen(st.open, c);
        const breaks = [];
        ctx.breaks.push(breaks); ctx.conts.push(c);
        const b = this.buildSeq(s.body, { open: [{ n: c, k: 'true' }], pending: null }, ctx);
        ctx.breaks.pop(); ctx.conts.pop();
        this.linkOpen(b.open, c, 'loop');
        st.open = [{ n: c, k: 'false' }].concat(breaks.map(n => ({ n, k: 'plain' })));
        st.pending = null;
        break;
      }
      case 'dowhile': {
        st.pending = null;
        const anchor = this.node('block');
        anchor.flags.anchor = true;
        this.linkOpen(st.open, anchor);
        const c = this.node('cond');
        c.ctag = 'do-while';
        c.lines.push({ toks: [kwTok('while'), opTok(' (')].concat(s.cond).concat([opTok(')'), { t: 'com', v: '  // do-while' }]), ctl: 'dowhile' });
        const breaks = [];
        ctx.breaks.push(breaks); ctx.conts.push(c);
        const b = this.buildSeq(s.body, { open: [{ n: anchor, k: 'plain' }], pending: null }, ctx);
        ctx.breaks.pop(); ctx.conts.pop();
        this.linkOpen(b.open, c);
        this.link(c, anchor, 'loop');
        st.open = [{ n: c, k: 'false' }].concat(breaks.map(n => ({ n, k: 'plain' })));
        st.pending = null;
        break;
      }
      case 'for': {
        if (s.init && s.init.length) ensure().lines.push({ toks: s.init.slice(), semi: true });
        st.pending = null;
        const c = this.node('cond');
        c.ctag = 'for';
        const condToks = (s.cond && s.cond.length) ? s.cond : [{ t: 'com', v: '/* no condition */' }];
        c.lines.push({ toks: [kwTok('for'), opTok(' (..; ')].concat(condToks).concat([opTok('; ..)')]), ctl: 'for' });
        this.linkOpen(st.open, c);
        const inc = this.node('block');
        inc.flags.incr = true;
        if (s.incr && s.incr.length) inc.lines.push({ toks: s.incr.slice(), semi: true });
        const breaks = [];
        ctx.breaks.push(breaks); ctx.conts.push((s.incr && s.incr.length) ? inc : c);
        const b = this.buildSeq(s.body, { open: [{ n: c, k: 'true' }], pending: null }, ctx);
        ctx.breaks.pop(); ctx.conts.pop();
        if (s.incr && s.incr.length) {
          this.linkOpen(b.open, inc);
          this.link(inc, c, 'loop');
        } else {
          this.linkOpen(b.open, c, 'loop');
        }
        st.open = [{ n: c, k: 'false' }].concat(breaks.map(n => ({ n, k: 'plain' })));
        st.pending = null;
        break;
      }
      case 'switch': {
        st.pending = null;
        const c = this.node('cond');
        c.ctag = 'switch';
        c.lines.push({ toks: [kwTok('switch'), opTok(' (')].concat(s.expr).concat([opTok(')')]) });
        this.linkOpen(st.open, c);
        const breaks = [];
        ctx.breaks.push(breaks);
        let running = [];
        let pendingLabels = [];
        let hasDefault = false;
        for (const cs of s.cases) {
          const lbl = cs.label === null
            ? 'default:'
            : 'case ' + cs.label.map(x => x.v).join('') + ':';
          if (cs.label === null) hasDefault = true;
          if (cs.body.length === 0) { pendingLabels.push(lbl); continue; }
          const elabel = pendingLabels.concat([lbl]).join(' ');
          pendingLabels = [];
          const startOpen = [{ n: c, k: 'case', elabel }].concat(running);
          const r = this.buildSeq(cs.body, { open: startOpen, pending: null }, ctx);
          running = r.open;
        }
        ctx.breaks.pop();
        // leftover labels with no body at all still dangle from cond — fall out
        let openOut = running;
        if (!hasDefault) openOut = openOut.concat([{ n: c, k: 'case', elabel: pendingLabels.concat(['(other)']).join(' ') }]);
        else if (pendingLabels.length) openOut = openOut.concat([{ n: c, k: 'case', elabel: pendingLabels.join(' ') }]);
        st.open = openOut.concat(breaks.map(n => ({ n, k: 'plain' })));
        st.pending = null;
        break;
      }
    }
  }
  return st;
};

CfgBuilder.prototype.ensureElseIfSeq = function (elsAst, parentBlock, ctx) {
  // elsAst: AST của else-if (k === 'if')
  // parentBlock: block chứa dòng "if" của branch cha — tạo F edge từ đây tới else-if block
  const self = this;
  // st tạm cho else branch: open đầu = [{parentBlock, k:'false'}], pending = null
  const st = { open: [{ n: parentBlock, k: 'false' }], pending: null };
  const ensure = function () {
    if (!st.pending) {
      st.pending = self.node('block');
      self.linkOpen(st.open, st.pending);
      st.open = [{ n: st.pending, k: 'plain' }];
    }
    return st.pending;
  };
  // Block đầu của else branch — chứa dòng "else if (cond)"
  const firstBlock = ensure();
  firstBlock.lines.push({
    toks: [kwTok('else'), kwTok('if'), opTok(' (')].concat(elsAst.cond).concat([opTok(')')]),
    ctl: 'elseif'
  });
  // Build body của else-if (then của else-if)
  const thenSeq = self.buildSeq(elsAst.then, { open: [{ n: firstBlock, k: 'true' }], pending: null }, ctx);
  // Xử lý else của else-if (else-if-else, hoặc else-if-else-if)
  let elOpen = [];
  if (elsAst.els) {
    // unwrap array: parser trả về els = stmtOrBlock() → luôn là array
    const innerNode = (Array.isArray(elsAst.els) && elsAst.els.length === 1) ? elsAst.els[0] : elsAst.els;
    if (innerNode.k === 'if') {
      // ELSE-IF lồng: inner else-if xử lý bởi chính hàm này (đệ quy)
      // open của inner else-if = kết quả của ensureElseIfSeq
      const innerSeq = self.ensureElseIfSeq(innerNode, firstBlock, ctx);
      elOpen = innerSeq.open;
    } else {
      const el = self.buildSeq(elsAst.els, { open: [{ n: firstBlock, k: 'false' }], pending: null }, ctx);
      elOpen = el.open;
    }
  } else {
    // else-if không có else → F edge thoát từ firstBlock
    elOpen = [{ n: firstBlock, k: 'false' }];
  }
  // Gộp open của then branch và else branch
  const combinedOpen = thenSeq.open.concat(elOpen);
  return { open: combinedOpen, pending: thenSeq.pending || firstBlock };
};

/* Node "đầu hàm": kind 'entry' (block thường đã nuốt dòng chữ ký) HOẶC node giữ
 * kind riêng (cond/label) nhưng có flags.entry sau khi gộp chữ ký. Mọi nơi hiển
 * thị nhãn "· ENTRY" / nét đứt xanh / dò entry đều phải dùng hàm này. */
function isEntryNode(n) {
  return !!n && (n.kind === 'entry' || !!(n.flags && n.flags.entry));
}

CfgBuilder.prototype.build = function (parsed) {
  let entry = null;
  const st = { open: [], pending: null };
  if (parsed.header && parsed.header.length) {
    entry = this.node('entry');
    entry.lines.push({ toks: parsed.header, semi: false });
    st.open = [{ n: entry, k: 'plain' }];
  }
  const ctx = { breaks: [], conts: [] };
  const res = this.buildSeq(parsed.body, st, ctx);
  // Dòng chữ ký (prototype) KHÔNG PHẢI là một block. Để nó thành node 'entry' riêng
  // khiến MỌI block bị đánh số +1 so với cách người đọc đếm (B1 đáng lẽ là khối code
  // đầu tiên), AI phải viết thêm một note vô nghĩa kiểu "chưa có lệnh thực thi", và
  // graph thừa một ô chỉ chứa chữ ký. Gộp nó vào block kế tiếp.
  this.mergeHeaderIntoFirstBlock(entry);
  // resolve gotos
  for (const g of this.gotos) {
    if (g.name && this.labels[g.name]) this.link(g.from, this.labels[g.name], 'goto');
    else if (g.name && !this.labels[g.name]) this.warnings.push("goto '" + g.name + "': nhãn không tồn tại");
  }
  // mark fall-through tail nodes
  for (const o of res.open) o.n.flags.tail = true;
  this.collapse();
  // block rỗng còn sót = guard cắt ngang -> phải báo, đừng để người dùng đoán
  const leftEmpty = this.nodes.filter(v => v.kind === 'block' && !v.lines.length).length;
  if (leftEmpty) this.warnings.push(leftEmpty + ' block rỗng còn lại (hàm quá lớn, bỏ qua bước gộp)');
  this.dedupeEdges();
  return { nodes: this.nodes, edges: this.edges, warnings: this.warnings };
};

/* Gộp node 'entry' CHỈ chứa dòng chữ ký vào block ngay sau nó.
 * Điều kiện chặt (không gộp khi không chắc):
 *   · node đó đúng 1 dòng (dòng chữ ký),
 *   · KHÔNG có cạnh nào đi VÀO nó (nó là đầu hàm thật),
 *   · đúng 1 cạnh đi RA (rơi thẳng xuống block kế tiếp).
 * Thân hàm rỗng (không câu lệnh nào) → không có cạnh ra → GIỮ nguyên ô chữ ký.
 * Không đánh số lại id: id có khoảng trống là chuyện bình thường (collapse() cũng
 * xoá node mà không đánh số lại) và mọi nơi đều tra theo id, không theo vị trí. */
CfgBuilder.prototype.mergeHeaderIntoFirstBlock = function (entry) {
  if (!entry || entry.lines.length !== 1) return false;
  const outs = this.edges.filter(e => e.from === entry.id);
  if (outs.length !== 1) return false;
  if (this.edges.some(e => e.to === entry.id)) return false;
  let tgt = null;
  for (const n of this.nodes) if (n.id === outs[0].to) { tgt = n; break; }
  if (!tgt || tgt === entry) return false;
  // FIX(1): block đích có thể là 'cond' (hàm bắt đầu bằng while/for/switch) hoặc
  // 'label'. Ép kind='entry' như trước làm MẤT loại node → CSS k-cond biến mất,
  // computeBlockRole() báo sai vai trò cho AI, matchBlocks() tụt điểm kind.
  // Giữ nguyên kind khi nó mang thông tin; đánh dấu \"đầu hàm\" bằng flags.entry
  // (isEntryNode() là nguồn sự thật duy nhất cho nhãn · ENTRY / nét đứt xanh).
  tgt.lines = entry.lines.concat(tgt.lines || []);
  tgt.flags = tgt.flags || {};
  tgt.flags.entry = true;
  if (tgt.kind === 'block') tgt.kind = 'entry';
  this.edges = this.edges.filter(e => e.from !== entry.id && e.to !== entry.id);
  this.nodes = this.nodes.filter(n => n !== entry);
  return true;
};

// remove empty blocks, rerouting edges
CfgBuilder.prototype.collapse = function () {
  let changed = true;
  let guard = 0;
  // Mỗi vòng xoá ít nhất 1 node rỗng -> nodes.length+8 vòng là đủ để đạt điểm bất
  // động. Con số cố định 1000 trước đây khiến hàm lớn DỪNG SỚM và để lại hàng
  // trăm box rỗng trên sơ đồ mà không nói gì (đo: 1402 node còn 201 box trống).
  const LIMIT = this.nodes.length + 8;
  while (changed && ++guard < LIMIT) {
    changed = false;
    for (const v of this.nodes) {
      if (v.kind !== 'block' || v.lines.length > 0) continue;
      const ins = this.edges.filter(e => e.to === v.id);
      const outs = this.edges.filter(e => e.from === v.id);
      const newE = [];
      for (const i of ins) {
        for (const o of outs) {
          if (i.from === v.id || o.to === v.id) continue;
          // self-loop MỚI (i.from === o.to): chỉ giữ khi là vòng lặp thật —
          // do-while thân rỗng (cond → thân rỗng → cond) phải thành cond→cond
          // kind 'loop'; các self-loop plain do tích ins×outs thì bỏ (L2/C1).
          if (i.from === o.to && i.kind !== 'loop' && o.kind !== 'loop') continue;
          const lbl = [i.elabel, o.elabel].filter(Boolean).join(' ');
          newE.push({ from: i.from, to: o.to, kind: (o.kind === 'plain') ? i.kind : o.kind, elabel: lbl });
        }
      }
      this.edges = this.edges.filter(e => e.from !== v.id && e.to !== v.id).concat(newE);
      this.nodes = this.nodes.filter(n => n !== v);
      changed = true;
      break;
    }
  }
};

CfgBuilder.prototype.dedupeEdges = function () {
  const seen = new Set();
  this.edges = this.edges.filter(e => {
    const k = e.from + '|' + e.to + '|' + e.kind + '|' + e.elabel;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

/* ----------------------- SYNTAX HIGHLIGHTING --------------------------- */

export { CfgBuilder, isEntryNode };
