/* =========================================================================
 * PCODE Grapher · src/graph/FlowView.jsx — <ReactFlow> + MiniMap + Controls
 * THAY view.js / minimap.js / interact.js / arrange.js / hover.js của bản cũ.
 * ========================================================================= */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow, MiniMap, Controls, Background, BackgroundVariant, useReactFlow,
  applyNodeChanges, applyEdgeChanges,
} from '@xyflow/react';
import { CfgNode } from './CfgNode.jsx';
import { CfgEdge } from './CfgEdge.jsx';
import { NoteCardNode, NotePanelNode, NoteConnEdge } from './NoteCardNode.jsx';
import { MIN_ZOOM, MAX_ZOOM, VIRTUALIZE_AT, EDGE_PALETTES } from './constants.js';
import { useStore } from '../store/useStore.js';
import { getAdjacency, getPlainText } from './build.js';
import { refreshNoteNodes } from '../notes/ui.js';
import { clearHighlight as clearHl } from '../ui/highlight.js';
import { openNoteForEdge, openNoteForNode, closeNoteCard } from '../notes/ui.js';
import { IcMap } from '../ui/icons.jsx';

const nodeTypes = { cfg: CfgNode, noteCard: NoteCardNode, notePanel: NotePanelNode };
const edgeTypes = { cfg: CfgEdge, noteConn: NoteConnEdge };

/** Copy text với fallback execCommand (file:// / HTTP không có clipboard API). */
export function copyText(txt, done) {
  const finish = () => done && done();
  if (window.isSecureContext && navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).then(finish).catch(() => fallbackCopy(txt, finish));
  } else fallbackCopy(txt, finish);
}
function fallbackCopy(txt, done) {
  const ta = document.createElement('textarea');
  ta.value = txt;
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    done();
  } catch {
    /* ignore */
  }
  ta.remove();
}

export default function FlowView({ onTokenClick, onToggleExpand, apiRef, onViewportChange }) {
  const rfNodes = useStore((s) => s.rfNodes);
  const rfEdges = useStore((s) => s.rfEdges);
  const theme = useStore((s) => s.theme);
  const safeMode = useStore((s) => s.ui.safeMode);
  const fitNonce = useStore((s) => s.fitNonce);
  const setManualPos = useStore((s) => s.setManualPos);
  const toast = useStore((s) => s.toast);
  const closeNote = useStore((s) => s.closeNote);
  const rf = useReactFlow();
  const focusRef = useRef({ node: null, pinned: null, edge: null });
  const [mmHidden, setMmHidden] = useState(false);

  const total = rfNodes.length + rfEdges.length;
  const virtualize = total > VIRTUALIZE_AT;

  /* Class trên #board mà CSS cũ (.dimmed/.nhover/safemode) gate theo — v2 trước
   * chỉ gắn class từng node nên toàn bộ visual search/focus không hiển thị. */
  const boardCls = useMemo(() => {
    const cls = [];
    if (safeMode) cls.push('safemode');
    if (rfNodes.some((n) => n.data && n.data.dimmed)) cls.push('dimmed');
    if (rfNodes.some((n) => n.data && (n.data.focus || n.data.focus2 || n.data.pinned))) cls.push('nhover');
    return cls.join(' ') || undefined;
  }, [safeMode, rfNodes]);

  /* build từ đầu (!keepView) → fitView 1 lần (bản cũ renderGraph gọi
   * fitView(false); prop fitView của RF chỉ chạy lúc mount nên v2 mất hẳn). */
  const lastFitNonce = useRef(0);
  useEffect(() => {
    if (fitNonce === 0 || fitNonce === lastFitNonce.current) return;
    lastFitNonce.current = fitNonce;
    // không animation — như fitView(false) của bản cũ; maxZoom:1 vì cũ KHÔNG
    // phóng to quá 100% (scale = min(bw/gw, bh/gh, 1)), padding ~60px 2 chiều
    rf.fitView({ maxZoom: 1, padding: 0.07 });
  }, [fitNonce, rf]);

  /* --- click block: ghim focus 2 đầu (port togglePinFocus/hoverNode) --- */
  const onNodeClick = useCallback((ev, node) => {
    const nid = node.data && node.data.cfgNode ? node.data.cfgNode.id : null;
    if (nid == null) return;

    // F13 (FEATURES "Click block/edge → card mở cạnh block"): click thân block
    // CÓ note (và notes không tắt) → mở card note — hành vi 1.9.3 bị đánh rơi
    // khi port (chỉ edge được nối lại onEdgeClick). Click lại block đang mở
    // card → đóng card (toggle). Block không có note → chỉ ghim focus như F7.
    const st0 = useStore.getState();
    if (st0.notesMode !== 'off' && st0.notes && st0.notes.match) {
      const savedRef = st0.notes.match.nodeToSavedRef[nid];
      if (savedRef) {
        if (st0.openNoteAnchor && st0.openNoteAnchor.type === 'node' && st0.openNoteAnchor.nid === nid) {
          closeNoteCard();
        } else {
          openNoteForNode(nid); // card handlers mặc định do App đăng ký (registry)
        }
      }
    }

    const cur = focusRef.current.pinned;
    focusRef.current.pinned = cur === nid ? null : nid;
    useStore.getState().toast(focusRef.current.pinned != null
      ? 'Đã ghim focus node #' + nid + ' — click lại để bỏ'
      : 'Đã bỏ ghim focus');

    // Panel 📖 đang mở → tô .pl các câu tham chiếu block này (port
    // highlightSentenceForNode: click block ↔ sáng câu trong panel).
    const st = useStore.getState();
    if (st.ui.proseOpen && st.notes && st.notes.match) {
      useStore.setState({ plNodeRef: st.notes.match.nodeToSavedRef[nid] || null });
    }

    const adj = getAdjacency();
    const nb = focusRef.current.pinned != null && adj[nid] ? adj[nid].nodes : new Set();
    useStore.setState((s) => ({
      rfNodes: s.rfNodes.map((n) => {
        const id = n.data && n.data.cfgNode ? n.data.cfgNode.id : null;
        return {
          ...n,
          data: { ...n.data, focus: id === focusRef.current.pinned, focus2: nb.has(id), pinned: id === focusRef.current.pinned },
        };
      }),
      rfEdges: s.rfEdges.map((e) => ({
        ...e,
        data: {
          ...e.data,
          focus: focusRef.current.pinned != null && adj[nid] && adj[nid].edges.has(e.data.idx),
        },
      })),
    }));
  }, [toast]);

  /* --- click edge: focus edge + 2 block đầu cuối (+ hlInfo + mở card note
   *     của edge như interact.js cũ: focusEdge + openNoteForEdge) --- */
  const onEdgeClick = useCallback((ev, edge) => {
    ev.stopPropagation();
    if (edge.type && edge.type !== 'cfg') return; // nét nối note: không focus
    const idx = edge.data ? edge.data.idx : null;
    const ends = new Set([edge.source, edge.target]);
    const st = useStore.getState();
    const e = idx != null && st.graphData ? st.graphData.edges[idx] : null;
    if (e) {
      const pal = EDGE_PALETTES[st.theme === 'light' ? 'light' : 'dark'];
      const sty = pal[e.kind] || pal.plain;
      st.setUi({
        hlInfo: 'edge ' + (st.nodeRefMap[e.from] || '#' + e.from) + ' → ' +
          (st.nodeRefMap[e.to] || '#' + e.to) + ' · ' + (e.elabel || sty.label || e.kind) +
          ' · double-click block để zoom tới',
      });
    }
    useStore.setState((s) => ({
      rfEdges: s.rfEdges.map((e2) => ({ ...e2, data: { ...e2.data, focus: e2.id === edge.id } })),
      rfNodes: s.rfNodes.map((n) => ({ ...n, data: { ...n.data, focus2: ends.has(n.id) } })),
    }));
    // click edge cũng mở card note của edge đó (im lặng khi edge không có note)
    if (idx != null) openNoteForEdge(idx);
  }, []);

  /* --- click nền: bỏ mọi focus + highlight + card (port clearAllFocus) --- */
  const onPaneClick = useCallback(() => {
    focusRef.current = { node: null, pinned: null, edge: null };
    clearHl();
    closeNote();
    useStore.setState((s) => ({
      plNodeRef: null,
      rfNodes: s.rfNodes.map((n) => ({ ...n, data: { ...n.data, focus: false, focus2: false, pinned: false, lit: false, dimmed: false } })),
      rfEdges: s.rfEdges.map((e) => ({ ...e, data: { ...e.data, focus: false, lit: false, dimmed: false } })),
    }));
  }, [closeNote]);

  /* --- chuột phải trên block: copy code (port copyNode) --- */
  const onNodeContextMenu = useCallback((ev, node) => {
    // U7: card note / ô note là DOM THƯỜNG như 1.9.3 (interact.js loại
    // #noteLayer khỏi mọi gesture board) — KHÔNG preventDefault để bôi đen
    // xong chuột phải vẫn hiện menu native (Copy…) của trình duyệt. Chỉ
    // block cfg giữ hành vi "right-click block = copy code".
    if (node.type && node.type !== 'cfg') return;
    ev.preventDefault();
    const nid = node.data && node.data.cfgNode ? node.data.cfgNode.id : null;
    if (nid == null) return;
    copyText(getPlainText(nid), () => toast('Đã copy code của block #' + nid));
  }, [toast]);

  /* --- centerNode dùng chung (bản cũ view.js): chỉ DỜI view, zoom giữ / nâng
   *     lên tối thiểu 85% — KHÔNG zoom ra-vào theo kích thước block --- */
  const centerNodeImpl = useCallback((nid) => {
    const n = useStore.getState().rfNodes.find((x) => x.id === 'n' + nid);
    if (!n) return;
    const w = n.width || 220, h = n.height || 60;
    const zoom = Math.max(rf.getZoom(), 0.85);
    rf.setCenter(n.position.x + w / 2, n.position.y + h / 2, { zoom, duration: 240 });
  }, [rf]);

  /* --- dbl-click: block cfg → center (như bản cũ); card/ô note → BỎ QUA
   *     (guard .noteCard của interact.js — v2 trước dbl-click card là view nhảy) --- */
  const onNodeDoubleClick = useCallback((ev, node) => {
    if (node.type && node.type !== 'cfg') return;
    const nid = node.data && node.data.cfgNode ? node.data.cfgNode.id : null;
    if (nid != null) centerNodeImpl(nid);
  }, [centerNodeImpl]);

  const onPaneDoubleClick = useCallback(() => rf.fitView({ duration: 240, maxZoom: 1, padding: 0.07 }), [rf]);

  /* @xyflow/react v12 KHÔNG có prop onPaneDoubleClick (đã kiểm d.ts) — bản
   * trước gắn prop ma nên "dbl-click nền = fit" chết lặng, còn zoomOnDoubleClick
   * mặc định của RF thì zoom vào (ngược hành vi bản cũ). Bắt dblclick ở #board,
   * guard mọi phần tử tương tác để dbl-click block vẫn là centerNode. */
  const onBoardDoubleClick = useCallback((ev) => {
    if (ev.target.closest(
      '.react-flow__node, .react-flow__edge, .react-flow__controls, .react-flow__minimap, #mmToggle'
    )) return;
    onPaneDoubleClick();
  }, [onPaneDoubleClick]);

  /* --- API view cho hotkey / search (port view.js: fitView, zoomCenter, centerNode) --- */
  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = {
      fitView: () => rf.fitView({ duration: 240, maxZoom: 1, padding: 0.07 }),
      zoom100: () => rf.zoomTo(1, { duration: 200 }),
      zoomIn: () => rf.zoomIn({ duration: 150 }),
      zoomOut: () => rf.zoomOut({ duration: 150 }),
      pan: (dx, dy) => {
        const v = rf.getViewport();
        rf.setViewport({ ...v, x: v.x - dx, y: v.y - dy }, { duration: 150 });
      },
      centerNode: centerNodeImpl,
      /* F13: "Esc đóng card trước rồi mới bỏ focus" — bỏ RIÊNG focus/pin
       * (không đụng lit search như killStuck) cho stack Esc của App. */
      clearFocus: () => {
        focusRef.current = { node: null, pinned: null, edge: null };
        useStore.setState((s) => ({
          rfNodes: s.rfNodes.map((n) => (n.data && (n.data.focus || n.data.focus2 || n.data.pinned)
            ? { ...n, data: { ...n.data, focus: false, focus2: false, pinned: false } }
            : n)),
          rfEdges: s.rfEdges.map((e) => (e.data && e.data.focus
            ? { ...e, data: { ...e.data, focus: false } }
            : e)),
        }));
      },
      /* Debug 💥 kill: nhả mọi trạng thái focus/highlight bị kẹt (tương đương
       * dbgKill cũ — dọn class focus/pin/dimmed mà không layout lại). */
      killStuck: () => {
        focusRef.current = { node: null, pinned: null, edge: null };
        clearHl();
        useStore.setState((s) => ({
          plNodeRef: null,
          rfNodes: s.rfNodes.map((n) => ({
            ...n, hidden: false,
            data: { ...n.data, focus: false, focus2: false, pinned: false, lit: false, dimmed: false, hit: false, tokOn: null },
          })),
          rfEdges: s.rfEdges.map((e) => ({
            ...e, hidden: false,
            data: { ...e.data, focus: false, lit: false, dimmed: false },
          })),
        }));
        useStore.getState().dbgLog('KILL stuck states (manual)');
        useStore.getState().toast('Đã xoá mọi state kẹt');
      },
      /* T9 — window.__pcode.setView/getState (D10) đọc/ghi viewport RF */
      getView: () => rf.getViewport(),
      setView: (v) => rf.setViewport({ x: v.x || 0, y: v.y || 0, zoom: v.zoom || 1 }),
    };
    return () => { apiRef.current = null; };
  }, [rf, apiRef, centerNodeImpl]);

  /* --- controlled flow: áp mọi change (kéo node, select, đo kích thước) vào
   *     store. THIẾU cái này = node kéo xong bị hất về vị trí cũ (v2 từng mất) */
  const onNodesChange = useCallback((changes) => {
    useStore.setState((s) => {
      const rfNodes = applyNodeChanges(changes, s.rfNodes);
      /* FIX(34): React Flow ĐO LẠI node sau khi render (change 'dimensions').
       * Nếu số đo thật lệch số đo lúc layout (font nạp muộn, rename Ghidra làm
       * tên dài ra, zoom text của trình duyệt) thì handle dịch đi trong khi
       * data.points của ELK vẫn là đường CŨ → mũi tên trỏ lệch khỏi block.
       * Bỏ route ELK của mọi edge chạm node bị đổi kích thước; CfgEdge tự route
       * lại (A-star / smoothstep) theo toạ độ handle thật. */
      const resized = new Set();
      for (const c of changes) {
        if (c.type !== 'dimensions' || !c.dimensions) continue;
        const before = s.rfNodes.find((n) => n.id === c.id);
        if (!before) continue;
        const dw = Math.abs((before.width || 0) - c.dimensions.width);
        const dh = Math.abs((before.height || 0) - c.dimensions.height);
        if (dw > 2 || dh > 2) resized.add(c.id);
      }
      if (!resized.size) return { rfNodes };
      let touched = false;
      const rfEdges = s.rfEdges.map((e) => {
        if (!e.data || !e.data.points) return e;
        if (!resized.has(e.source) && !resized.has(e.target)) return e;
        touched = true;
        return { ...e, data: { ...e.data, points: null, sAnchor: null, tAnchor: null } };
      });
      return touched ? { rfNodes, rfEdges } : { rfNodes };
    });
  }, []);
  const onEdgesChange = useCallback((changes) => {
    useStore.setState((s) => ({ rfEdges: applyEdgeChanges(changes, s.rfEdges) }));
  }, []);

  /* --- kéo block xong: lưu manualPos + dời ô note/card theo block (bản cũ gọi
   *     renderNotes() sau drag; nếu không ô note ĐỨNG YÊN đè vị trí cũ) --- */
  const onNodeDragStop = useCallback((ev, node) => {
    // B5: card note ('nc') kéo xong phải GIỮ vị trí user thả — lưu cardPos và
    // KHÔNG refreshNoteNodes (refresh dựng lại card bằng pickCardSlot → teleport).
    if (node.id === 'nc') {
      useStore.setState({ cardPos: { x: node.position.x, y: node.position.y } });
      return;
    }
    const nid = node.data && node.data.cfgNode ? node.data.cfgNode.id : null;
    if (nid == null) return; // node phụ khác — không có gì để lưu/refresh
    setManualPos(nid, { x: node.position.x, y: node.position.y });
    try { refreshNoteNodes(); } catch { /* notes lỗi không phá drag */ }
  }, [setManualPos]);

  /* --- bắt đầu pan: bỏ focus TẠM (click edge/hover); focus GHIM giữ nguyên
   *     (port clearHighlight-on-move — trước đây là dead code, C2) --- */
  const onMoveStart = useCallback(() => {
    if (focusRef.current.pinned != null) return; // đang ghim → giữ
    const s = useStore.getState();
    const any = s.rfEdges.some((e) => e.data && e.data.focus) ||
      s.rfNodes.some((n) => n.data && (n.data.focus || n.data.focus2));
    if (!any) return;
    useStore.setState({
      rfNodes: s.rfNodes.map((n) => (n.data && (n.data.focus || n.data.focus2)
        ? { ...n, data: { ...n.data, focus: false, focus2: false } } : n)),
      rfEdges: s.rfEdges.map((e) => (e.data && e.data.focus
        ? { ...e, data: { ...e.data, focus: false } } : e)),
    });
  }, []);

  const minimapColor = useCallback(
    (n) => {
      const k = n.data && n.data.cfgNode ? n.data.cfgNode.kind : 'block';
      const pal = EDGE_PALETTES[theme === 'light' ? 'light' : 'dark'];
      const nd = n.data && n.data.cfgNode;
      // v5.1: entry không còn xanh T (nhầm success) — accent dịu / plain+
      if (k === 'entry' || (nd && nd.flags && nd.flags.entry && k !== 'cond'))
        return theme === 'light' ? '#0969da' : '#4d7cff';
      if (k === 'cond') return pal.loop.col;
      if (k === 'label') return pal.goto.col;
      return pal.plain.col;
    },
    [theme]
  );

  const defaultEdgeOptions = useMemo(() => ({ type: 'cfg' }), []);

  return (
    <div id="board" className={boardCls} style={{ width: '100%', height: '100%' }}
      onDoubleClick={onBoardDoubleClick}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        fitView
        onlyRenderVisibleElements={virtualize}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        zoomOnDoubleClick={false}
        proOptions={{ hideAttribution: true }}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        onNodeContextMenu={onNodeContextMenu}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onMoveStart={onMoveStart}
        onMove={(ev, v) => onViewportChange && onViewportChange(v)}
        deleteKeyCode={null}
        multiSelectionKeyCode={null}
      >
        {/* v5: bỏ chấm nền (Dots) — board phẳng theo --bg. Light giữ lưới
            cực mảnh Lines để vẫn định hướng không gian; dark = không pattern. */}
        {!safeMode && theme === 'light' ? (
          <Background
            variant={BackgroundVariant.Lines} gap={28} lineWidth={0.5}
            color="#d8dee6"
          />
        ) : null}
        {/* 🗺 nút bật/tắt minimap (port initMinimapToggle — v2 trước bỏ sót,
            FEATURES F5 yêu cầu giữ) */}
        <button
          id="mmToggle"
          aria-pressed={mmHidden ? 'false' : 'true'}
          title={mmHidden ? 'Hiện minimap' : 'Ẩn minimap'}
          style={{ opacity: mmHidden ? 0.5 : 1 }}
          onClick={(ev) => { ev.stopPropagation(); setMmHidden((h) => !h); }}
        >
          <IcMap size={15} />
        </button>
        {!mmHidden ? (
          <MiniMap id="minimap" pannable zoomable nodeColor={minimapColor} nodeStrokeWidth={2} />
        ) : null}
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
