/* =========================================================================
 * PCODE Grapher · src/App.jsx — shell v2.0 (T10)
 * header · #side (SidePanel) · #splitter · #board (Toolbar + FlowView + notes)
 * · statusbar · toast host · debug HUD · overlay phím tắt · paste modal.
 * ========================================================================= */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import FlowView, { copyText } from './graph/FlowView.jsx';
import SidePanel from './ui/SidePanel.jsx';
import Toolbar from './ui/Toolbar.jsx';
import Splitter, { SIDE_DEFAULT } from './ui/Splitter.jsx';
import DebugPanel from './ui/DebugPanel.jsx';
import HelpOverlay from './ui/HelpOverlay.jsx';
import { IcBolt, IcDown, IcHelp, IcSun, IcMoon } from './ui/icons.jsx';
import { useStore } from './store/useStore.js';
import { build } from './graph/build.js';
import { clearMeasureCache } from './graph/layout.js';
import { applyHighlights, toggleKey, clearHighlight } from './ui/highlight.js';
import { installHotkeys } from './ui/hotkeys.js';
import { SAMPLE } from './sample.js';
import { loadSourceFile } from './ui/SidePanel.jsx';
import NotesHud from './notes/NotesHud.jsx';
import ProsePanel from './notes/ProsePanel.jsx';
import {
  installNotesEnv, importAINotes, clearNotes, notePromptFor, aiPromptText, aiDataJson,
} from './notes/index.js';
import {
  refreshNoteNodes, openNoteForNode, openNoteForEdge, closeNoteCard, jumpToRef,
  applyNoteText, cycleNotesMode, clearMainPath, applyMainPath,
  registerCardHandlers, clearProsePl,
} from './notes/ui.js';
import { onSourceEdited, setRebuildOnRename, _teardown as ghidraTeardown } from './ghidra/bridge.js';
import { installPcodeApi } from './api.js';
import {
  exportSVGFile, exportPNG, exportPNGView, exportSession, importSession, exportDebugData, download,
} from './export/index.js';

installNotesEnv();

export default function App() {
  const stats = useStore((s) => s.stats);
  const toasts = useStore((s) => s.ui.toasts);
  const proseOpen = useStore((s) => s.ui.proseOpen);
  const netStatus = useStore((s) => s.ui.netStatus);
  const sideW = useStore((s) => s.ui.sideW);
  const theme = useStore((s) => s.theme);
  const building = useStore((s) => s.building);
  const toast = useStore((s) => s.toast);
  const setUi = useStore((s) => s.setUi);

  const flowApi = useRef(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [zoom, setZoom] = useState(1);

  const centerNode = useCallback((nid) => flowApi.current?.centerNode(nid), []);
  const onTokenClick = useCallback((key, additive) => toggleKey(key, additive), []);

  /* ------- handlers card note ------- */
  const cardHandlers = useCallback(() => ({
    onClose: () => closeNoteCard(),
    onJump: (ref) => jumpToRef(ref, { centerNode }),
    onCopy: (text) => copyText(text, () => toast('Đã copy note')),
    onCopyPrompt: (ref, state) => {
      const text = notePromptFor(ref, state === 'ok' ? 'ask' : 'regen');
      if (text == null) { toast('Cần Build graph + notes (📥) trước'); return; }
      copyText(text, () => toast('Đã copy AI prompt ' + ref + ' — dán vào AI, nhận JSON 1 note rồi dán lại vào 📥 Notes'));
    },
    onSaveEdit: (ref, text, orig) => applyNoteText(ref, text, orig),
    onOpenEdgeNote: (idx) => openNoteForEdge(idx, cardHandlers()),
    onCenterNode: centerNode,
  }), [centerNode, toast]);

  const openNote = useCallback((nid) => openNoteForNode(nid, cardHandlers()), [cardHandlers]);

  const doBuild = useCallback(async (keepView) => {
    const r = await build(keepView, {
      onTokenClick,
      onToggleExpand: (nid) => { useStore.getState().toggleExpand(nid); doBuild(true); },
      onOpenNote: openNote,
    });
    refreshNoteNodes(cardHandlers());
    if (useStore.getState().hlKeys.size) applyHighlights();
    // build từ đầu (Ctrl+Shift+Enter, Sample, mở file, Ghidra mở hàm…) → fitView,
    // như nhánh `else fitView(false)` cuối renderGraph cũ (v2 trước đánh rơi
    // vì prop fitView của React Flow chỉ áp lúc mount).
    if (r && !keepView) useStore.getState().requestFit();
    return r;
  }, [onTokenClick, openNote, cardHandlers]);

  /* ------- khởi động -------
   * FIX(33): measureNodes() đo bằng DOM ẩn — nếu font mono chưa nạp xong thì mọi
   * kích thước block đo bằng font DỰ PHÒNG, trong khi lát sau block vẽ bằng font
   * thật ⇒ hộp node (điểm bám mũi tên, route ELK) sai so với hộp nhìn thấy: đúng
   * triệu chứng "sau F5 mũi tên không khớp block". Chờ document.fonts.ready
   * (tối đa 1,5s) rồi mới build lần đầu; nếu font về muộn hơn thì xoá cache đo và
   * dựng lại 1 lần, giữ nguyên khung nhìn. */
  useEffect(() => {
    let alive = true;
    const r = useStore.getState().hydrate();
    if (!r || !r.hadSrc) useStore.getState().setSrc(SAMPLE);

    const fonts = typeof document !== 'undefined' ? document.fonts : null;
    const ready = fonts && fonts.ready
      ? Promise.race([fonts.ready, new Promise((res) => setTimeout(res, 1500))])
      : Promise.resolve();

    ready.then(() => {
      if (!alive) return;
      clearMeasureCache();
      doBuild(false);
      // font có thể vẫn còn đang nạp (timeout 1,5s) → canh lần cuối
      if (fonts && fonts.ready) {
        fonts.ready.then(() => {
          if (!alive || fonts.status !== 'loaded') return;
          clearMeasureCache();
          doBuild(true);
        });
      }
    });
    return () => { alive = false; };
  }, [doBuild]);

  useEffect(() => () => ghidraTeardown(), []);
  // B2: Ghidra rename symbol → tên hiển thị dài/ngắn đi → cần đo + layout lại
  // nhận keepView từ bridge: rename giữ view (true), syncFunction hàm mới fit (false)
  useEffect(() => { setRebuildOnRename((keepView) => doBuild(!!keepView)); }, [doBuild]);
  useEffect(() => { installPcodeApi({ flowApi, rebuild: doBuild }); }, [doBuild]);

  /* Handlers card mặc định: đường refreshNoteNodes() không truyền handlers
   * (đổi mode notes, click nền đóng card rồi mở lại, jumpToRef từ panel 📖…)
   * vẫn giữ nút bấm sống — port "handler sống trên DOM" của bản cũ. */
  useEffect(() => registerCardHandlers(cardHandlers()), [cardHandlers]);

  /* Auto-save pcode.src mỗi 10s (port main.js cũ): ghi trong requestIdleCallback
   * để serialise nguồn lớn không chặn frame; fallback setTimeout (Safari).
   * v2 trước chỉ lưu khi build → mất <10s gõ tay nếu đóng tab sớm. */
  useEffect(() => {
    const idle = (fn) => (window.requestIdleCallback
      ? window.requestIdleCallback(fn, { timeout: 5000 })
      : setTimeout(fn, 0));
    const t = setInterval(() => { idle(() => useStore.getState().saveSrc()); }, 10000);
    return () => clearInterval(t);
  }, []);

  /* Đổi theme → vẽ lại với palette mới (bản cũ renderGraph keepView; nếu không
   * edge giữ màu theme cũ tới lần build sau vì màu edge nằm trong data.node). */
  const prevThemeRef = useRef(theme);
  useEffect(() => {
    if (prevThemeRef.current === theme) return;
    prevThemeRef.current = theme;
    if (useStore.getState().graphData) doBuild(true);
  }, [theme, doBuild]);

  /* ------- theme: class trên <html> như bản cũ ------- */
  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
    document.documentElement.style.colorScheme = theme === 'light' ? 'light' : 'dark';
  }, [theme]);

  const doImportNotes = useCallback(() => {
    const r = importAINotes(pasteText);
    if (r && r.ok) {
      setPasteOpen(false);
      setPasteText('');
      doBuild(true); // mode full cần layout dự trù chỗ cho ô note
    }
  }, [pasteText, doBuild]);

  const loadSessionFile = useCallback(() => document.getElementById('sessionFile')?.click(), []);

  /* ------- phím tắt ------- */
  useEffect(() => installHotkeys({
    build: () => doBuild(true),
    rebuildFresh: () => doBuild(false),
    fitView: () => flowApi.current?.fitView(),
    zoom100: () => flowApi.current?.zoom100(),
    zoomIn: () => flowApi.current?.zoomIn(),
    zoomOut: () => flowApi.current?.zoomOut(),
    pan: (dx, dy) => flowApi.current?.pan(dx, dy),
    focusSearch: () => document.getElementById('hlInput')?.focus(),
    saveSession: () => exportSession(),
    openSession: () => loadSessionFile(),
    cycleNotes: () => { if (cycleNotesMode()) doBuild(true); },
    toggleDebug: () => setUi({ dbgOpen: !useStore.getState().ui.dbgOpen }),
    toggleHelp: () => setUi({ helpOpen: !useStore.getState().ui.helpOpen }),
    escape: () => {
      const s = useStore.getState();
      if (pasteOpen) { setPasteOpen(false); return true; }
      if (s.ui.helpOpen) { setUi({ helpOpen: false }); return true; }
      if (s.hlKeys.size) { clearHighlight(); return true; }
      if (s.mainPathOn) { clearMainPath(); return true; }
      if (s.openNoteKey) { closeNoteCard(); return true; }
      if (s.ui.proseOpen) {
        setUi({ proseOpen: false });
        clearProsePl();
        useStore.setState({ plNodeRef: null });
        return true;
      }
      if (s.ui.dbgOpen) { setUi({ dbgOpen: false }); return true; }
      // F13: cuối stack — bỏ focus/pin còn ghim ("Esc đóng card trước rồi mới bỏ focus")
      if (s.rfNodes.some((n) => n.data && (n.data.pinned || n.data.focus || n.data.focus2)) ||
          s.rfEdges.some((e) => e.data && e.data.focus)) {
        flowApi.current?.clearFocus?.();
        return true;
      }
      return false;
    },
  }), [doBuild, pasteOpen, setUi, loadSessionFile]);

  const toggleProse = useCallback(() => {
    const s = useStore.getState();
    if (!s.notes || !s.notes.summary) { toast('Chưa có AI notes (📥) để xem luồng logic'); return; }
    const open = !s.ui.proseOpen;
    setUi({ proseOpen: open });
    if (!open) { clearProsePl(); useStore.setState({ plNodeRef: null }); }
  }, [setUi, toast]);

  /* kéo-thả file vào VÙNG GRAPH (bản cũ nhận cả #board, v2 trước chỉ ô source) */
  const onBoardDrop = useCallback((ev) => {
    ev.preventDefault();
    const f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
    if (f) loadSourceFile(f, doBuild);
  }, [doBuild]);

  return (
    <>
      <a className="skip-link" href="#board">Bỏ qua tới đồ thị</a>
      <header>
        <h1><IcBolt size={16} /> <b>PCODE Grapher</b></h1>
        <span className="sub">Control-flow graph cho pseudocode Ghidra/IDA · paste → graph · màu biến/hàm riêng</span>
        <span style={{ flex: 1 }} />
        <button id="btnTheme" title="Đổi giao diện Sáng/Tối" aria-label="Đổi giao diện Sáng/Tối"
          onClick={() => useStore.getState().setTheme(theme === 'light' ? 'dark' : 'light')}>
          {theme === 'light' ? <IcSun /> : <IcMoon />}
        </button>
        <span id="netStatus" className="sub">{netStatus}</span>
        <button id="btnHelp" title="Phím tắt (?)" onClick={() => setUi({ helpOpen: true })}><IcHelp /></button>
      </header>

      <main>
        {/* #side dùng flex (css cũ) — bề rộng do splitter/persist quyết định */}
        <SidePanel width={sideW || SIDE_DEFAULT} rebuild={doBuild}
          onCenterNode={centerNode} onSourceEdited={onSourceEdited} />
        <Splitter />

        <ReactFlowProvider>
          <div id="boardWrap" style={{ position: 'relative', minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column' }}
            onDragOver={(ev) => { ev.preventDefault(); if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy'; }}
            onDrop={onBoardDrop}>
            {/* U1: toolbar + HUD.note nằm HÀNG RIÊNG phía trên canvas — trước đây
                cả hai position:absolute đè lên board (toolbar 16 nút rộng ~984px
                phủ dải đỉnh) nên click badge/block đầu hàm rơi vào nút toolbar
                (đo bằng elementFromPoint: badge B1 → BUTTON#btnImportNotes). */}
            <div id="boardTop">
              <NotesHud
                onModeChange={() => doBuild(true)}
                onToggleProse={toggleProse}
                onClearNotes={() => { clearNotes(true); refreshNoteNodes(); }}
              />
              <Toolbar
                flowApi={flowApi}
                zoomPct={zoom}
                onExportPNG={() => exportPNG()}
                onExportPNGView={() => exportPNGView()}
                onExportSVG={() => exportSVGFile()}
                onExportDebug={() => exportDebugData(flowApi.current?.getView?.())}
                onAIData={(redact) => {
                  const json = aiDataJson(redact);
                  if (json == null) return;
                  download('pcode-ai-data.json', new Blob([json], { type: 'application/json' }));
                  toast(redact
                    ? 'Đã xuất AI data (ẩn địa chỉ hex)'
                    : 'Đã xuất AI data — dán vào chat AI rồi bấm 📥 Notes để nạp note');
                }}
                onAIPrompt={(redact) => {
                  const t = aiPromptText(redact);
                  if (t == null) return;
                  copyText(t, () => toast('Đã copy prompt AI (' + Math.round(t.length / 1024) + ' KB, ' +
                    ((t.match(/"ref": ?"B\d+"/g) || []).length) +
                    ' block) — dán vào chat AI, nhận JSON rồi bấm 📥 Notes'));
                }}
                onImportNotes={() => setPasteOpen(true)}
                onToggleProse={toggleProse}
                onMainPath={() => applyMainPath()}
                onSaveSession={() => exportSession()}
                onLoadSession={loadSessionFile}
                onToggleDbg={() => setUi({ dbgOpen: !useStore.getState().ui.dbgOpen })}
              />
            </div>
            <FlowView
              onTokenClick={onTokenClick}
              onToggleExpand={(nid) => { useStore.getState().toggleExpand(nid); doBuild(true); }}
              apiRef={flowApi}
              onViewportChange={(v) => setZoom(v.zoom)}
            />
            {proseOpen ? (
              <ProsePanel
                onClose={() => { setUi({ proseOpen: false }); clearProsePl(); useStore.setState({ plNodeRef: null }); }}
                onCenterNode={centerNode} />
            ) : null}
            <DebugPanel flowApi={flowApi} rebuild={doBuild}
              onCopy={(t) => copyText(t, () => toast('Đã copy debug info — gửi cho dev!'))} />
          </div>
        </ReactFlowProvider>
      </main>

      <div id="statusbar">
        <span id="stats">{stats}</span>
        <span style={{ flex: 1 }} />
        {building ? <span className="sub">đang vẽ…</span> : null}
        <span id="sbZoom" className="sub">{Math.round(zoom * 100) + '%'}</span>
      </div>

      <input id="sessionFile" type="file" accept="application/json" style={{ display: 'none' }}
        onChange={(ev) => {
          const f = ev.target.files && ev.target.files[0];
          if (!f) return;
          const rd = new FileReader();
          rd.onload = () => importSession(rd.result, doBuild);
          rd.readAsText(f);
          ev.target.value = '';
        }} />

      {pasteOpen ? (
        <div id="pasteModal" role="dialog" aria-modal="true" aria-label="Dán JSON notes"
          onPointerDown={(ev) => { if (ev.target.id === 'pasteModal') setPasteOpen(false); }}>
          <div className="pm-box">
            <div className="pm-head">
              <IcDown size={16} /> Dán JSON notes do AI trả về
              <button id="pmClose" aria-label="Đóng" onClick={() => setPasteOpen(false)}>✕</button>
            </div>
            <textarea id="pmText" value={pasteText} spellCheck={false}
              autoFocus onFocus={(e) => e.target.select()}
              placeholder='{"blocks":[{"ref":"B1","note":"..."}],"edges":[]}'
              onChange={(e) => setPasteText(e.target.value)}
              onKeyDown={(ev) => {
                if (ev.key === 'Escape') { ev.stopPropagation(); setPasteOpen(false); }
                else if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') { ev.preventDefault(); doImportNotes(); }
              }} />
            <div className="pm-btns">
              <button id="pmImport" className="primary" onClick={doImportNotes}>Nạp notes (Ctrl+Enter)</button>
              <button id="pmCancel" onClick={() => setPasteOpen(false)}>Huỷ</button>
            </div>
          </div>
        </div>
      ) : null}

      <HelpOverlay />

      <div id="toast">
        {toasts.map((t) => <div key={t.id} className="toast show">{t.msg}</div>)}
      </div>
    </>
  );
}
