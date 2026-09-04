/* =========================================================================
 * PCODE Grapher · src/graph/build.js — pipeline build() (SPEC §6, FILE-MAP main.js)
 *
 * Port `build()` + `renderGraph()` cũ: parse → CFG → refMap → đo → layout →
 * đổi sang node/edge React Flow. Giữ renderSeq guard (render mới thắng render cũ)
 * và hàng đợi buildPending (bấm Build khi đang vẽ → vẽ lại đúng 1 lần sau đó).
 * ========================================================================= */

import { lex } from '../core/lexer.js';
import { parseFunction } from '../core/parser.js';
import { CfgBuilder } from '../core/cfg.js';
import {
  layoutGraph, rebuildNodeRefMap, measureNodes, nodePlainText, clearMeasureCache,
} from './layout.js';
import { useStore } from '../store/useStore.js';
import { prepareNoteReserves } from '../notes/cards.js';

/** CFG + layout → { nodes, edges } của React Flow (SPEC §6 mapping). */
export function toFlowGraph(graphData, layout, ctx) {
  const {
    nodeRefMap = {}, colorVars = true, expanded = {}, liveNames = new Map(), theme = 'dark',
    notes = null, notesMode = 'off', mainPathNodes = null, mainPathEdges = null,
    lit = {}, dimmed = {}, focus = null, focus2 = null, pinned = null,
    onTokenClick, onToggleExpand, onOpenNote,
  } = ctx || {};

  const byRef = (notes && notes.match && notes.match.byRef) || {};
  const noteByNodeId = {};
  for (const [ref, m] of Object.entries(byRef)) {
    if (m && m.nodeId != null) {
      const src = (notes.blocks || []).find((b) => b.ref === ref);
      if (src) noteByNodeId[m.nodeId] = { note: src, state: m.state };
    }
  }
  // Chấm state trên edge (port `.edgeDot` của renderNotes cũ): CfgEdge hiển
  // dấu • trên nhãn khi edge đó có note — trước đây toFlowGraph không bao giờ
  // gán nên dot không bao giờ hiện.
  const edgeByRef = (notes && notes.match && notes.match.edgeByRef) || {};
  const edgeNoteRefOf = (i) =>
    notes && notes.match && notes.match.edgeIdxToSavedRef ? notes.match.edgeIdxToSavedRef[i] : null;

  const nodes = (graphData.nodes || []).map((n) => {
    const hit = noteByNodeId[n.id];
    return {
      id: 'n' + n.id,
      type: 'cfg',
      position: layout.positions[n.id] || { x: 0, y: 0 },
      width: layout.sizes[n.id] ? layout.sizes[n.id].width : undefined,
      height: layout.sizes[n.id] ? layout.sizes[n.id].height : undefined,
      draggable: true,
      selectable: true,
      connectable: false,
      data: {
        cfgNode: n,
        rankdir: ctx.rankdir || 'TB',
        ref: nodeRefMap[n.id] || 'B?',
        colorVars,
        liveNames,
        expanded: !!expanded[n.id],
        note: hit ? hit.note.text || hit.note.summary || '' : null,
        noteState: hit ? hit.state : null,
        notesMode,
        mainPath: mainPathNodes ? mainPathNodes.has(n.id) : false,
        lit: !!lit['n' + n.id],
        dimmed: !!dimmed['n' + n.id],
        focus: focus === n.id,
        focus2: focus2 ? focus2.has(n.id) : false,
        pinned: pinned === n.id,
        onTokenClick,
        onToggleExpand,
        onOpenNote, // badge ✓/⚠/✗ → mở card (bản React trước đánh mất ở đây)
      },
    };
  });

  // Điểm neo handle DỰ KIẾN tại thời điểm layout (tâm cạnh block theo hướng).
  // CfgEdge so với source/target thật của React Flow: lệch quá ngưỡng nghĩa là
  // node đã bị kéo sau layout → route ELK lỗi thời → fallback smoothstep.
  const rankdir = (ctx && ctx.rankdir) || 'TB';
  const anchorOf = (id, role) => {
    const p = layout.positions[id];
    const s = layout.sizes[id];
    if (!p || !s) return null;
    if (rankdir === 'LR') {
      return role === 'src'
        ? { x: p.x + s.width, y: p.y + s.height / 2 }
        : { x: p.x, y: p.y + s.height / 2 };
    }
    return role === 'src'
      ? { x: p.x + s.width / 2, y: p.y + s.height }
      : { x: p.x + s.width / 2, y: p.y };
  };

  // Nhóm edge theo CẶP node (không phân hướng): 2 edge cùng cặp = trùng đường
  // khi fallback smoothstep (đã chứng minh: if(a){} b(); → T + F cùng 1→2).
  const pgroups = new Map();
  (graphData.edges || []).forEach((e, i) => {
    const k = e.from <= e.to ? e.from + '|' + e.to : e.to + '|' + e.from;
    if (!pgroups.has(k)) pgroups.set(k, []);
    pgroups.get(k).push(i);
  });
  const pinfo = {};
  for (const arr of pgroups.values()) {
    arr.forEach((idx, j) => { pinfo[idx] = { pidx: j, pcount: arr.length }; });
  }

  const edges = (graphData.edges || []).map((e, i) => {
    const eRef = edgeNoteRefOf(i);
    return {
      id: 'e' + i,
      source: 'n' + e.from,
      target: 'n' + e.to,
      type: 'cfg',
      data: {
        kind: e.kind,
        elabel: e.elabel || '',
        theme,
        idx: i,
        lit: !!lit['e' + i],
        dimmed: !!dimmed['e' + i],
        mainPath: mainPathEdges ? mainPathEdges.has(i) : false,
        // Dot chỉ hiện khi notes KHÔNG ở chế độ tắt (giống renderNotes cũ)
        noteState: notesMode !== 'off' && eRef ? ((edgeByRef[eRef] || {}).state) || 'orphan' : null,
        // A1/A3: waypoints ELK đã route + snap — CfgEdge vẽ đúng đường này,
        // chỉ fallback smoothstep khi thiếu route / node đã bị kéo tay.
        points: (layout.routes && layout.routes[i]) || null,
        sAnchor: anchorOf(e.from, 'src'),
        tAnchor: anchorOf(e.to, 'tgt'),
        rankdir,
        // A2: edge song song cùng cặp node (T/F guard-clause, goto 2 chiều…)
        // → fallback smoothstep tách nhau bằng offset thay vì trùng khít 100%.
        pidx: (pinfo[i] || {}).pidx || 0,
        pcount: (pinfo[i] || {}).pcount || 1,
      },
    };
  });

  return { nodes, edges };
}

/** Bảng adjacency (hover focus 2 đầu) — port phần adj của renderGraph. */
export function buildAdjacency(graphData) {
  const adj = {};
  (graphData.edges || []).forEach((e, i) => {
    adj[e.from] = adj[e.from] || { nodes: new Set(), edges: new Set() };
    adj[e.to] = adj[e.to] || { nodes: new Set(), edges: new Set() };
    adj[e.from].nodes.add(e.to);
    adj[e.from].edges.add(i);
    adj[e.to].nodes.add(e.from);
    adj[e.to].edges.add(i);
  });
  return adj;
}

let adjacency = {};
let plainText = {};
export const getAdjacency = () => adjacency;
export const getPlainText = (nid) => plainText[nid] || '';
/** Toàn bộ map nodeId → code thuần (thay global `nodePlain` của bản cũ). */
export const getAllPlainText = () => plainText;

/* Hook notes (T6): tránh phụ thuộc vòng build ⇄ notes — src/notes/index.js tự
 * đăng ký. build() gọi sau khi graphData/lastParsed đã vào store, như bản cũ
 * gọi syncNotesWithGraph() ở cuối renderGraph(). */
let notesSync = null;
export function setNotesSync(fn) { notesSync = fn; }

let isBuilding = false;
/** Build bị dồn hàng: {keepView, hooks, resolvers[]} — B4: caller của bản build
 * "nợ" phải nhận được KẾT QUẢ THẬT (promise chain), không phải null. */
let buildPending = null;

/**
 * build(keepView) — điểm vào duy nhất để vẽ lại graph.
 * Giữ nguyên hành vi bản cũ: dồn hàng khi đang vẽ, finally luôn nhả cờ.
 */
export async function build(keepView = false, hooks = {}) {
  const st = useStore.getState();
  if (isBuilding) {
    if (!buildPending) buildPending = { keepView, hooks, resolvers: [] };
    else { buildPending.keepView = keepView; buildPending.hooks = hooks; }
    st.dbgLog('build() dồn lại vì đang vẽ');
    // trả promise resolve bằng kết quả của bản build thật (chạy trong finally)
    return new Promise((resolve) => buildPending.resolvers.push(resolve));
  }
  isBuilding = true;
  st.setUi({ warn: '' });
  useStore.setState({ building: true });

  try {
    const code = useStore.getState().src;
    if (!code.trim()) {
      st.setWarn('Paste pseudocode trước (hoặc bấm Sample).');
      useStore.setState({ graphData: null, rfNodes: [], rfEdges: [], stats: '' });
      return null;
    }

    const my = useStore.getState().renderSeq + 1;
    useStore.setState({ renderSeq: my });

    let parsed;
    try {
      parsed = parseFunction(lex(code));
    } catch (e) {
      st.setWarn('Parse error: ' + e.message);
      return null;
    }
    st.setErrLine(parsed.errLine || 0);

    // Đổi nguồn → node id đánh lại từ đầu, cache đo theo id cũ thành RÁC nguy
    // hiểm (B1: hash cũ = html.length, trùng độ dài là dùng nhầm size) → xoá.
    if (useStore.getState().adoptSourceScope(code)) clearMeasureCache();

    const graphData = new CfgBuilder().build(parsed);
    const nodeRefMap = rebuildNodeRefMap(graphData);
    adjacency = buildAdjacency(graphData);
    plainText = {};
    for (const n of graphData.nodes) plainText[n.id] = nodePlainText(n);

    // ═══ B3: commit graphData/lastParsed rồi RE-ANCHOR NOTES *TRƯỚC* layout ═══
    // Bản cũ (renderGraph) re-anchor trước khi dự trù chỗ note; v2 trước đây
    // notesSync chạy CUỐI build → prepareNoteReserves/toFlowGraph dùng match CŨ
    // (nodeToSavedRef trỏ id đã trôi) → ô note đặt nhầm block / đè block, và
    // sau reload (notesMode='full' persist) build đầu không chừa chỗ.
    useStore.setState({ graphData, lastParsed: parsed, nodeRefMap });
    let notesInfo = null;
    if (notesSync) {
      try {
        notesInfo = notesSync();
      } catch (e) {
        useStore.getState().dbgLog('notes sync lỗi: ' + (e && e.message));
      }
    }

    const s = useStore.getState();
    const sizes = measureNodes(graphData, {
      colorVars: s.opts.colorVars, expanded: s.expanded, theme: s.theme,
      preset: s.opts.preset, nodeRefMap, liveNames: s.liveNames, // B2: đo bằng tên HIỂN THỊ
      onLog: s.dbgLog, // FIX(35): báo khi số đo DOM lệch công thức số-dòng
    });

    // renderGraph cũ gọi prepareNoteReserves() trước layout MỖI LẦN — giờ dùng
    // match MỚI (notesSync vừa chạy ở trên). Ngoài mode full thì reserve = {}.
    let noteReserve = s.noteReserve;
    if (s.notesMode === 'full' && s.notes && s.notes.match) {
      noteReserve = prepareNoteReserves(s.notes, graphData, 'full');
      if (noteReserve !== s.noteReserve) useStore.setState({ noteReserve });
    } else if (Object.keys(s.noteReserve || {}).length) {
      noteReserve = {};
      useStore.setState({ noteReserve });
    }

    const layout = await layoutGraph(graphData, {
      preset: s.opts.preset, rankdir: s.opts.rankdir, colorVars: s.opts.colorVars,
      expanded: s.expanded, theme: s.theme, manualPos: s.manualPos,
      noteReserve, nodeRefMap, sizes, onLog: s.dbgLog, liveNames: s.liveNames,
    });

    // render cũ không được thắng render mới
    if (useStore.getState().renderSeq !== my) return null;

    const cur = useStore.getState();
    // B10: 🧭 luồng chính phải SỐNG QUA rebuild (đổi theme/expand) — dựng lại
    // Set node/edge từ lit đang bật; trước đây toFlowGraph không nhận nên
    // highlight biến mất mà cờ mainPathOn vẫn true (Esc phải bấm thừa).
    const mpN = cur.mainPathOn
      ? new Set(Object.keys(cur.lit).filter((k) => k[0] === 'n').map((k) => +k.slice(1)))
      : null;
    const mpE = cur.mainPathOn
      ? new Set(Object.keys(cur.lit).filter((k) => k[0] === 'e').map((k) => +k.slice(1)))
      : null;
    const { nodes, edges } = toFlowGraph(graphData, layout, {
      nodeRefMap,
      rankdir: cur.opts.rankdir,
      colorVars: cur.opts.colorVars,
      expanded: cur.expanded,
      liveNames: cur.liveNames,
      theme: cur.theme,
      notes: cur.notes,
      notesMode: cur.notesMode,
      lit: cur.lit,
      dimmed: cur.dimmed,
      mainPathNodes: mpN,
      mainPathEdges: mpE,
      onTokenClick: hooks.onTokenClick,
      onToggleExpand: hooks.onToggleExpand,
      onOpenNote: hooks.onOpenNote,
    });

    useStore.setState({
      rfNodes: nodes, rfEdges: edges, stats: layout.stats,
    });

    // cảnh báo: nhiều hàm / lỗi parser / warning CFG (port nguyên văn thứ tự cũ)
    const msgs = [];
    if (parsed.extras && parsed.extras.length) {
      const at = parsed.extrasAt && parsed.extrasAt[0] ? ' (hàm kế tiếp ở dòng ' + parsed.extrasAt[0] + ')' : '';
      msgs.push(
        'file có ' + (parsed.extras.length + 1) + ' hàm — chỉ vẽ hàm "' + (parsed.fn || '?') + '"' + at +
        ' · cần bấm vào hàm đó hoặc tách từng hàm'
      );
    }
    // Text không phải code → parser trả 0 block, bản cũ im lặng để màn hình
    // trống không lời giải thích. Cảnh báo ở TẦNG UI (không đụng core).
    if (!graphData.nodes.length) {
      msgs.push('không tìm thấy hàm nào trong đoạn mã — cần một hàm dạng "kiểu tên(tham số) { … }"');
    }
    if (parsed.errors && parsed.errors.length) msgs.push(...parsed.errors);
    if (graphData.warnings && graphData.warnings.length) msgs.push(...graphData.warnings);
    if (msgs.length) st.setWarn('⚠ ' + msgs.join(' · '));

    useStore.getState().dbgLog(
      'render ' + graphData.nodes.length + 'n/' + graphData.edges.length + 'e keepView=' + !!keepView +
      ' engine=' + layout.engine + ' ' + layout.ms.toFixed(0) + 'ms'
    );
    // toast notes (notesSync đã chạy TRƯỚC layout — xem B3 ở trên)
    if (notesInfo && notesInfo.autoApplied) {
      useStore.getState().toast('Đã tự áp dụng notes đã lưu'); // bản cũ có, v2 đánh rơi
    }
    if (notesInfo && notesInfo.renamed) {
      useStore.getState().toast('Đã đồng bộ ' + notesInfo.renamed + ' note theo tên biến mới');
    }

    useStore.getState().saveSrc();
    return { graphData, layout, notes: notesInfo };
  } catch (e) {
    console.error('build failed:', e);
    useStore.getState().setWarn('⚠ Lỗi không xác định: ' + (e && e.message ? e.message : e));
    return null;
  } finally {
    // PHẢI nhả trong mọi đường (kể cả exception) — bản 1.x từng treo vĩnh viễn.
    isBuilding = false;
    useStore.setState({ building: false });
    if (buildPending) {
      const p = buildPending;
      buildPending = null;
      const pr = build(p.keepView, p.hooks);
      // caller đã await bản bị dồn → trả cho họ kết quả bản build thật (B4)
      p.resolvers.forEach((resolve) => resolve(pr));
    }
  }
}

/** Chỉ dùng cho test. */
export function _resetBuildState() {
  isBuilding = false;
  buildPending = null;
  adjacency = {};
  plainText = {};
}
