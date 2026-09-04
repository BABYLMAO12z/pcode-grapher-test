/* =========================================================================
 * PCODE Grapher · src/notes/ai.js
 * PORT NGUYÊN VĂN js/ui/notes-ai.js (411 dòng) — AI export (📤/📋) +
 * prompt cho 1 note (📋). AI_PROMPT_HEAD và AI_PROMPT_SCHEMA chép NGUYÊN VĂN.
 *
 * Khác bản cũ DUY NHẤT ở chỗ lấy dữ liệu: global → getEnv().
 * ========================================================================= */

import * as PcodeCore from '../core/index.js';
import { srcScopeOf } from '../graph/constants.js';
import { isEntryNode } from '../core/cfg.js';
import { getEnv } from './env.js';
import { liveRenameMap, applyRenameMap } from './anchors.js';

// --- const AI_NOTES_VERSION ---
export const AI_NOTES_VERSION = 1;

// --- const AI_PROMPT_HEAD ---
export const AI_PROMPT_HEAD = `Bạn là trình phân tích mã giả decompiled (C của Ghidra). Nhiệm vụ: đọc DỮ LIỆU và ghi chú phân tích TRUNG LƯỢNG cho MỌI block và MỌI edge, phục vụ người đọc kỹ thuật.

═══ CẤU TRÚC DỮ LIỆU — ĐỌC KỸ ═══

Mỗi block có field "role" cho biết VAI TRÒ trong CFG:
  • "entry"          — đầu hàm (prototype + khai báo + prologue). ĐÂY LUÔN LÀ B1.
  • "entry+condition:if" (hoặc :elseif/:while/:for/:switch) — block ĐẦU hàm chứa LUÔN lệnh rẽ nhánh: áp dụng ĐỒNG THỜI quy tắc của "entry" và của "condition:*" (phải nêu điều kiện và các nhánh)
  • "condition:if"   — chứa lệnh "if (...)" — RẼ NHÁNH
  • "condition:elseif" — chứa "else if (...)" — RẼ NHÁNH (luôn là đích của edge FALSE từ if trước)
  • "condition:else" — chứa "else" đơn thuần
  • "condition:while" — điều kiện vòng while
  • "condition:for"  — điều kiện vòng for
  • "condition:do-while" — điều kiện do-while (cuối thân lặp)
  • "condition:switch" — lệnh switch
  • "body:then"      — thân THEN (điều kiện ĐÚNG)
  • "body:else"      — thân ELSE (điều kiện SAI)
  • "body:loop"      — thân vòng lặp
  • "body:case"      — thân một nhánh case
  • "terminal"       — return/break/continue (kết thúc luồng)
  • "label"          — nhãn goto
  • "prologue"       — lệnh tuần tự trước rẽ nhánh đầu
  • "body"           — thân chung (mặc định)

Mỗi edge có field "edgeHint" mô tả SẴN ý nghĩa (VD: "FALSE", "TRUE", "LOOP", "CASE...").
Mỗi edge có field "toRole" cho biết VAI TRÒ block đích (VD: "condition:elseif", "body:then").

═══ QUY TẮC ELSE-IF — CỰC KỲ QUAN TRỌNG ═══

Code C: if (A) { ... } else if (B) { ... }
CFG tạo ra:
  B1 = "condition:if"     → chứa "if (A)"
  B2 = "body:then"        → code trong then
  B3 = "condition:elseif" → chứa "else if (B)"  ← ĐIỀU KIỆN, không phải thân code
  B4 = "body:then"        → code trong else-if then

Cạnh: B1─TRUE→B2, B1─FALSE→B3, B3─TRUE→B4
  ✅ Edge B1─FALSE→B3: "Vì A sai nên chuyển tới B3 — tại đây kiểm tra tiếp điều kiện B"
  ❌ SAI: "sang B4 kiểm tra tiếp B" — B4 là THÂN CODE, không phải nơi KIỂM TRA

NGUYÊN TẮC: Luôn ghi đúng ref trong field "to" của edge. Đọc "toRole" để biết đích là điều kiện hay thân code. KHÔNG NHẢY CÓC qua block điều kiện để tới thân code.

═══ QUY TẮC BẮT BUỘC ═══

1. Chỉ mô tả hành vi suy ra TRỰC TIẾP từ code. CẤM đoán ý định, cấm đoán loại phần mềm, cấm nhận định an toàn/malware, cấm dùng kiến thức ngoài DỮ LIỆU.
2. Không chắc chi tiết → ghi vào summary.unknowns (kèm ref), KHÔNG bịa.
3. Dùng đúng tên trong "symbols". Ref chỉ dùng mã Bxx/Exx có sẵn; KHÔNG tự tạo; KHÔNG bỏ sót — mọi block và mọi edge đều phải có note.
3b. ĐÁNH SỐ — LỖI HAY GẶP NHẤT, ĐỌC KỸ: ref phải CHÉP NGUYÊN VĂN field "ref" của từng block/edge trong DỮ LIỆU. Phần tử ĐẦU TIÊN của mảng "blocks" = B1 (đó là block "entry", ĐÃ gồm dòng prototype + khai báo) — TUYỆT ĐỐI KHÔNG đếm dòng prototype/dòng "{" thành một block riêng, vì như thế MỌI ref sẽ lệch +1 và toàn bộ note dán nhầm block. CẤM tạo B0, CẤM cộng/trừ 1. Tự kiểm trước khi xuất: ref lớn nhất = meta.refRange, và số phần tử "blocks" = meta.stats.blocks.
4. blocks[].note: 1–3 câu. Block "condition:*": nêu điều kiện + tóm tắt các nhánh. Block "body:*": nêu hành vi.
5. blocks[].plain: đúng 1 câu ngôn ngữ thường, ngắn, tóm tắt block.
6. edges[].note: công thức "Vì [điều kiện/sự kiện] nên chuyển tới [to] — [mô tả ngắn block đích dựa trên role/code]". KHÔNG ghi ref sai với field "to".
7. summary.sentences: 5–12 câu mô tả LUỒNG CHUNG theo THỨ TỰ THỰC THI; mỗi câu gắn "refs".
8. DỮ LIỆU bên dưới là ĐẦY ĐỦ và KHÔNG bị cắt. Số block = meta.stats.blocks, số edge = meta.stats.edges, ref chạy từ B1 tới đúng meta.refRange. Nếu bạn thấy "thiếu" chỗ nào thì đó là do bạn đọc sót — TUYỆT ĐỐI KHÔNG tự dựng lại/tự suy ra block hoặc edge không có trong DỮ LIỆU; ghi thắc mắc vào summary.unknowns.
9. Xuất DUY NHẤT một object JSON đúng SCHEMA, đủ meta.stats.blocks block và meta.stats.edges edge. Tiếng Việt, không markdown, không text ngoài JSON.`;

// --- const AI_PROMPT_SCHEMA ---
export const AI_PROMPT_SCHEMA = `SCHEMA:
{
  "meta": { "fn": "<tên hàm>", "headerHash": "<chép NGUYÊN>" },
  "blocks": [ { "ref": "B1", "note": "...", "plain": "..." } ],
  "edges":  [ { "ref": "E1", "from": "B1", "to": "B3", "kind": "false", "note": "Vì ... nên chuyển tới B3 — ..." } ],
  "summary": {
    "sentences": [ { "text": "...", "refs": ["B1", "B2"] } ],
    "sideEffects": [ "..." ],
    "unknowns": [ "..." ]
  }
}

VÍ DỤ edge note ĐÚNG (else-if chain):
  E(B1→B2, kind:"true", toRole:"body:then"):
    "Vì điều kiện local_130=='\\0' ĐÚNG nên chuyển tới B2 — khối xử lý lỗi không đọc được phản hồi"
  E(B1→B3, kind:"false", toRole:"condition:elseif"):
    "Vì điều kiện local_130=='\\0' SAI nên chuyển tới B3 — tại đây kiểm tra tiếp cờ local_12f"
  E(B3→B4, kind:"true", toRole:"body:then"):
    "Vì điều kiện local_12f=='\\0' ĐÚNG nên chuyển tới B4 — khối xử lý phản hồi không hợp lệ"

VÍ DỤ edge note SAI (CẤM):
  E(B1→B3, kind:"false"): "Vì ... SAI nên chuyển tới B4 kiểm tra cờ local_12f"
  ← SAI vì: edge tới B3 (toRole:"condition:elseif"), KHÔNG PHẢI B4`;

// --- function redactHex ---
export function redactHex(s) {
  return String(s == null ? '' : s).replace(/0[xX][0-9a-fA-F]{4,}/g, '0x…');
}

// --- function aiSymbolTable ---
export function aiSymbolTable() {
  const env = getEnv();
  const out = [];
  const seen = new Set();
  const push = (s) => {
    const key = s.addr || s.name;
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(s);
  };
  try {
    const GHDR = env.GHDR;
    if (GHDR && GHDR.connected) {
      for (const text in GHDR.symByText) {
        const info = GHDR.symByText[text];
        if (!info) continue;
        push({
          text, addr: info.addr || null, name: info.name || text,
          source: info.source || 'DEFAULT', kind: info.kind || null, type: info.type || null,
        });
      }
    }
  } catch { /* bridge state hỏng → về nhánh offline */ }
  if (out.length === 0) {
    const src = env.src || '';
    const m = src.match(/\b(?:FUN_|DAT_|PTR_|LAB_|s_)[A-Za-z0-9_]*\b/g) || [];
    const kindOf = { FUN_: 'function', DAT_: 'data', PTR_: 'data', LAB_: 'label', s_: 'data' };
    for (const name of m) {
      const pre = name.slice(0, name.indexOf('_') + 1);
      push({ text: name, addr: null, name, source: 'inferred', kind: kindOf[pre] || 'unknown', type: null });
    }
  }
  // KHÔNG giới hạn số symbol: thiếu tên thì model bịa tên → note lệch với graph.
  return out;
}

// --- function computeBlockRole ---
export function computeBlockRole(node, graphData) {
  if (!node) return 'body';
  if (isEntryNode(node)) {
    // Block ĐẦU hàm có thể vừa là đầu hàm vừa chứa điều kiện rẽ nhánh.
    for (const L of node.lines || []) {
      if (!L.ctl) continue;
      const tag = L.ctl === 'dowhile' ? 'do-while' : L.ctl;
      return 'entry+condition:' + tag;
    }
    return node.kind === 'cond' ? 'entry+condition:' + (node.ctag || 'cond') : 'entry';
  }
  if (node.kind === 'label') return 'label';
  if (node.kind === 'cond') return 'condition:' + (node.ctag || 'cond');
  if (node.lines && node.lines.length) {
    for (const L of node.lines) {
      if (L.ctl) {
        if (L.ctl === 'if') return 'condition:if';
        if (L.ctl === 'elseif') return 'condition:elseif';
        if (L.ctl === 'while') return 'condition:while';
        if (L.ctl === 'for') return 'condition:for';
        if (L.ctl === 'dowhile') return 'condition:do-while';
        return 'condition:' + L.ctl;
      }
    }
  }
  // Phân tích cạnh vào để xác định body role (TRƯỚC terminal).
  if (graphData && graphData.edges) {
    for (const e of graphData.edges) {
      if (e.to !== node.id) continue;
      const fromNode = graphData.nodes.find(function (n) { return n.id === e.from; });
      if (!fromNode) continue;
      if (e.kind === 'true') {
        if (fromNode.kind === 'cond') return 'body:then';
        if (fromNode.lines && fromNode.lines.some(function (l) { return l.ctl === 'if' || l.ctl === 'elseif'; })) return 'body:then';
      }
      if (e.kind === 'false') {
        if (!node.lines || !node.lines.some(function (l) { return l.ctl; })) return 'body:else';
      }
      if (e.kind === 'loop') return 'body:loop';
      if (e.kind === 'case') return 'body:case';
    }
  }
  // terminal (return/break) — chỉ khi không phải body:then/else/loop/case
  if (node.flags && node.flags.terminal) return 'terminal';
  // Prologue: block đầu sau entry
  if (graphData && graphData.edges) {
    var entryNode = graphData.nodes.find(function (n) { return isEntryNode(n); });
    if (entryNode && graphData.edges.some(function (e) { return e.from === entryNode.id && e.to === node.id; })) {
      return 'prologue';
    }
  }
  if (node.flags && node.flags.tail) return 'terminal';
  return 'body';
}

// --- function edgeHintText ---
export function edgeHintText(edge) {
  var k = edge.kind || 'plain';
  switch (k) {
    case 'true': return 'TRUE (điều kiện thoả mãn)';
    case 'false': return 'FALSE (điều kiện không thoả mãn)';
    case 'loop': return 'LOOP (quay lại đầu vòng lặp)';
    case 'goto': return 'GOTO (nhảy tới nhãn)';
    case 'case': return 'CASE' + (edge.elabel ? ' (' + edge.elabel + ')' : '');
    case 'plain': return 'plain (tuần tự)';
    default: return k;
  }
}

// --- function exportAIData ---
export function exportAIData(redact) {
  const env = getEnv();
  const graphData = env.graphData, lastParsed = env.lastParsed, nodePlain = env.nodePlain || {};
  if (!graphData || !lastParsed) {
    env.toast('Hãy Build graph trước khi xuất AI data');
    return null;
  }
  const R = redact ? redactHex : (s) => s;
  const src = env.src || '';
  const headerPlain = (lastParsed.header || []).map((t) => t.v).join(' ');
  const anchors = PcodeCore.buildAnchors(graphData);
  // node.id → ref (node.id có khoảng trống sau collapse — KHÔNG được id+1)
  const nodeById = {};
  (graphData.nodes || []).forEach((n) => { nodeById[n.id] = n; });
  const refOf = {};
  anchors.forEach((a) => { refOf[a.nodeId] = a.ref; });
  // Data gửi AI phải dùng TÊN NGƯỜI DÙNG ĐANG THẤY trên graph (live từ bridge).
  const liveMap = liveRenameMap();

  const blocks = anchors.map((a) => {
    const n = nodeById[a.nodeId] || {};
    const plain = nodePlain[a.nodeId] || '';
    return {
      ref: a.ref,
      role: computeBlockRole(n, graphData),
      kind: n.kind + (n.ctag ? ':' + n.ctag : ''),
      lines: a.lines,
      code: R(applyRenameMap(plain, liveMap)),
      skeleton: R(a.skeleton),
      skHash: a.skHash,
      tokens: (a.ids || []).map((k) => liveMap.get(k) || k),
    };
  });

  const edges = (graphData.edges || []).map((e, i) => {
    const fromNode = nodeById[e.from] || {};
    const toNode = nodeById[e.to] || {};
    const toPlain = nodePlain[e.to] || '';
    const out = {
      ref: 'E' + (i + 1),
      from: refOf[e.from] || 'B' + (e.from + 1),
      to: refOf[e.to] || 'B' + (e.to + 1),
      kind: e.kind || 'plain',
      label: e.elabel || '',
      edgeHint: edgeHintText(e),
      toRole: computeBlockRole(toNode, graphData),
    };
    // Điều kiện đứng TRƯỚC edge: ghi cho BẤT KỲ block nào có dòng ctl.
    var hasCtl = fromNode.lines && fromNode.lines.some(function (l) { return !!l.ctl; });
    if (hasCtl || fromNode.kind === 'cond') {
      var condLine = applyRenameMap(nodePlain[e.from] || '', liveMap).split('\n')[0] || '';
      if (condLine) out.fromCond = R(condLine);
    }
    var preview = applyRenameMap(toPlain, liveMap).split('\n')[0] || '';
    if (preview) out.toPreview = R(preview);
    return out;
  });

  return {
    meta: {
      version: AI_NOTES_VERSION,
      fn: lastParsed.fn || '',
      header: R(headerPlain),
      headerHash: PcodeCore.fnv1a(headerPlain),
      srcHash: srcScopeOf(src),
      stats: {
        blocks: blocks.length,
        edges: edges.length,
        chars: src.length,
        lines: src ? src.split('\n').length : 0,
      },
      // mốc để model tự kiểm mình có đánh số lệch không
      refRange: 'B1..B' + blocks.length + ' · E1..E' + edges.length,
    },
    symbols: aiSymbolTable(),
    blocks,
    edges,
  };
}

// --- function aiDataJson ---
export function aiDataJson(redact) {
  const data = exportAIData(redact);
  return data ? JSON.stringify(data, null, 1) : null;
}

// --- function aiPromptText ---
export function aiPromptText(redact) {
  const json = aiDataJson(redact);
  if (json == null) return null;
  return AI_PROMPT_HEAD + '\n\n' + AI_PROMPT_SCHEMA + '\n\nDỮ LIỆU:\n' + json;
}

// --- function tryApplySingleNote ---
export function tryApplySingleNote(o) {
  const env = getEnv();
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const ref = typeof o.ref === 'string' ? o.ref.trim() : '';
  const isEdge = /^E\d+$/.test(ref);
  const isBlock = /^B\d+$/.test(ref);
  if (!isEdge && !isBlock) return null;
  if (typeof o.note !== 'string' || !o.note.trim()) return null;
  if (!env.notes) { env.toast('Nạp notes đầy đủ (📥) trước, rồi mới paste note đơn'); return null; }
  const list = isEdge ? env.notes.edges || [] : env.notes.blocks || [];
  const it = list.find((x) => x.ref === ref);
  if (!it) { env.toast('Không tìm thấy note ' + ref + ' trong notes hiện tại'); return null; }
  it.note = o.note.trim();
  if (!isEdge && typeof o.plain === 'string' && o.plain.trim()) it.plain = o.plain.trim();
  it.manual = false; // text do AI trả về → KHÔNG manual (lần import sau được ghi đè)
  if (env.saveNotes) env.saveNotes();
  env.saveState();
  env.renderNotes();
  if (env.openNoteKey === ref) env.reopenCard();
  env.toast('Đã cập nhật note ' + ref);
  return { ok: true, single: ref, counts: null, keptManual: 0 };
}

// --- function notePromptFor ---
export function notePromptFor(savedRef, purpose) {
  const env = getEnv();
  const notes = env.notes;
  if (!notes || !notes.match || !env.graphData || !env.lastParsed) return null;
  const isEdge = savedRef[0] === 'E';
  const data = exportAIData(false);
  if (!data) return null;
  // savedRef là ref KHÔNG GIAN CŨ (lúc export); data là export MỚI → phải map
  // qua notes.match trước khi tra, nếu không prompt chứa code của block SAI (L3).
  let curRef = savedRef;
  if (isEdge) {
    const v = notes.match.edgeByRef ? notes.match.edgeByRef[savedRef] : null;
    if (v && v.idx != null) curRef = 'E' + (v.idx + 1); // buildEdgeAnchors: ref = 'E'+(idx+1)
  } else {
    const v = notes.match.byRef ? notes.match.byRef[savedRef] : null;
    if (v && v.anchorRef) curRef = v.anchorRef;
  }
  const src = isEdge
    ? (data.edges || []).find((e) => e.ref === curRef)
    : (data.blocks || []).find((b) => b.ref === curRef);
  const saved = (isEdge ? notes.edges || [] : notes.blocks || []).find((x) => x.ref === savedRef);
  if (!src || !saved) return null;
  const p = String(purpose) === 'regen' ? 'regen' : 'ask';
  const L = [];
  L.push('Bạn là trình phân tích mã giả decompiled (C của Ghidra). Nhiệm vụ: ' +
    (p === 'regen'
      ? 'TẠO LẠI note phân tích cho ' + savedRef + ' — code đã THAY ĐỔI từ lúc viết note cũ. Đọc dữ liệu MỚI dưới đây và viết note mới từ đầu.'
      : 'CẢI THIỆN note phân tích cho ' + savedRef + ' — người đọc muốn note rõ hơn, đầy đủ hơn (vẫn trung lập).'));
  L.push('QUY TẮC: trung lập; chỉ mô tả hành vi suy ra TRỰC TIẾP từ code; CẤM đoán ý định; tiếng Việt; không markdown; 1–2 câu.');
  if (isEdge) {
    L.push('EDGE ' + savedRef + ' (kind: ' + (src.kind || '?') + ', edgeHint: ' + (src.edgeHint || '?') + '):');
    L.push(JSON.stringify({
      from: src.from, to: src.to, kind: src.kind,
      edgeHint: src.edgeHint || null, toRole: src.toRole || null,
      fromCond: src.fromCond || null, toPreview: src.toPreview || null,
    }, null, 1));
    L.push('QUY TẮC: Ghi đúng ref "to" (' + src.to + ') trong note, KHÔNG nhảy cóc sang block khác.');
  } else {
    L.push('BLOCK ' + savedRef + ' (role: ' + (src.role || '?') + ', kind: ' + (src.kind || '?') + '):');
    L.push('CODE:');
    L.push(src.code || '');
    L.push('SKELETON: ' + (src.skeleton || ''));
    if (src.lines) L.push('DÒNG NGUỒN: ' + JSON.stringify(src.lines));
    if (src.role && src.role.indexOf('condition:') === 0) {
      L.push('LƯU Ý: Block này là ĐIỀU KIỆN rẽ nhánh — khi viết note, nêu rõ điều kiện và các nhánh.');
    }
  }
  const syms = data.symbols || []; // đầy đủ — không cắt
  if (syms.length) {
    L.push('SYMBOLS (dùng đúng tên này):');
    syms.forEach((s) => L.push('  ' + s.name + (s.type ? ' : ' + s.type : '') + (s.addr ? ' @ ' + s.addr : '')));
  }
  L.push('NOTE HIỆN TẠI (tham khảo' + (p === 'regen' ? ' — đã CŨ, viết lại hoàn toàn' : ' — cải thiện tiếp') + '): ' + saved.note);
  if (saved.plain) L.push('PLAIN HIỆN TẠI: ' + saved.plain);
  L.push('XUẤT DUY NHẤT một object JSON, không text trước/sau:');
  L.push(isEdge
    ? '{ "ref": "' + savedRef + '", "note": "Vì <điều kiện/sự kiện> nên <chuyển tới Bxx — nó làm gì đó>" }'
    : '{ "ref": "' + savedRef + '", "note": "<1–2 câu block này làm gì>", "plain": "<1 câu ngôn ngữ thường>" }');
  return L.join('\n');
}
