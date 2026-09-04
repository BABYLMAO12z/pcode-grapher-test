/* =========================================================================
 * PCODE Grapher · src/notes/mainpath.js — 🧭 luồng chính (port notes-panel.js)
 *
 * Bản cũ gán thẳng class .lit/.dimmed lên DOM; v2 trả về map lit/dimmed giống
 * search (src/ui/search.js) để store phát cho CfgNode/CfgEdge. Thuật toán chọn
 * block/edge và fallback GIỮ NGUYÊN.
 * ========================================================================= */
import { isEntryNode } from '../core/cfg.js';

/**
 * Fallback khi AI không trả summary: BFS từ entry, chỉ đi cạnh plain/true.
 * @returns {{n:Set<number>, e:Set<number>}}
 */
export function mainPathFallback(graphData) {
  const litN = new Set(), litE = new Set();
  const nodes = (graphData && graphData.nodes) || [];
  /* FIX(21): đoạn mã dán KHÔNG có dòng chữ ký (chỉ là thân hàm / một mẩu code)
   * thì CfgBuilder không tạo node entry nào → bản cũ trả về rỗng và 🧭 "luồng
   * chính" bấm vào KHÔNG TÔ GÌ, im lặng như hỏng. Dự phòng: node không có cạnh
   * vào (điểm bắt đầu thực sự), cuối cùng mới lấy block đầu tiên. */
  const hasIn = new Set(((graphData && graphData.edges) || []).map((e) => e.to));
  const entry = nodes.find((n) => isEntryNode(n)) ||
    nodes.find((n) => !hasIn.has(n.id)) ||
    nodes[0];
  if (!entry) return { n: litN, e: litE };
  const out = {};
  (graphData.edges || []).forEach((e, i) => {
    if (e.kind !== 'plain' && e.kind !== 'true') return;
    (out[e.from] = out[e.from] || []).push({ to: e.to, i });
  });
  const queue = [entry.id], seen = new Set();
  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id)) continue;
    seen.add(id);
    litN.add(id);
    (out[id] || []).forEach(({ to, i }) => { litE.add(i); if (!seen.has(to)) queue.push(to); });
  }
  return { n: litN, e: litE };
}

/**
 * Tính luồng chính từ notes.summary.sentences[].refs; rỗng → fallback.
 * @returns {{litN:Set, litE:Set, source:string, lit:object, dimmed:object}}
 */
export function computeMainPath(notes, graphData) {
  const litN = new Set(), litE = new Set();
  const seen = new Set();
  const match = (notes && notes.match) || { byRef: {}, edgeByRef: {} };
  (((notes && notes.summary) || {}).sentences || []).forEach((s) =>
    (s.refs || []).forEach((ref) => {
      if (seen.has(ref)) return;
      seen.add(ref);
      const v = ref[0] === 'B' ? match.byRef[ref] : match.edgeByRef[ref];
      if (!v) return;
      if (ref[0] === 'B' && v.nodeId != null) litN.add(v.nodeId);
      else if (ref[0] === 'E' && v.idx != null) {
        litE.add(v.idx);
        const ed = (graphData.edges || [])[v.idx];
        if (ed) { litN.add(ed.from); litN.add(ed.to); }
      }
    })
  );
  let source = 'tóm tắt AI';
  if (!litN.size && !litE.size) {
    const fb = mainPathFallback(graphData);
    fb.n.forEach((n) => litN.add(n));
    fb.e.forEach((n) => litE.add(n));
    source = 'fallback plain/true';
  }
  const lit = {}, dimmed = {};
  for (const id of litN) lit['n' + id] = true;
  for (const i of litE) lit['e' + i] = true;
  for (const n of graphData.nodes || []) if (!litN.has(n.id)) dimmed['n' + n.id] = true;
  (graphData.edges || []).forEach((_, i) => { if (!litE.has(i)) dimmed['e' + i] = true; });
  return { litN, litE, source, lit, dimmed };
}
