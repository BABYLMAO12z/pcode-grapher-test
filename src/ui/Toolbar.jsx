/* =========================================================================
 * PCODE Grapher · src/ui/Toolbar.jsx — thanh nút nổi trên board (port #toolbar)
 * 4 cụm (ngăn bởi .tb-sep):
 *   [zoom −/%/+ · 1:1 · Fit] | [PNG · SVG · Debug] | [AI data · AI prompt ·
 *   Notes · 📖 prose · 🧭 luồng chính] | [Save · Load · 🐞 dbg].
 * Icon SVG inline (icons.jsx) thay emoji — render sắc nét mọi DPI/theme.
 * ========================================================================= */

import { useStore } from '../store/useStore.js';
import {
  IcDown, IcUp, IcCopy, IcBug, IcBook, IcCompass, IcSave, IcTerm,
} from './icons.jsx';

export default function Toolbar({
  flowApi, onExportPNG, onExportSVG, onExportDebug, onAIData, onAIPrompt,
  onImportNotes, onToggleProse, onMainPath, onSaveSession, onLoadSession, onToggleDbg,
  onExportPNGView, zoomPct,
}) {
  const proseOpen = useStore((s) => s.ui.proseOpen);
  const dbgOpen = useStore((s) => s.ui.dbgOpen);
  const mainPathOn = useStore((s) => s.mainPathOn);

  return (
    <div id="toolbar">
      <div className="zgrp">
        <button id="zOut" title="Zoom out (−)" onClick={() => flowApi.current?.zoomOut()}>−</button>
        <span id="zPct" title="Về 100%" role="button" tabIndex={0}
          onClick={() => flowApi.current?.zoom100()}
          onKeyDown={(e) => { if (e.key === 'Enter') flowApi.current?.zoom100(); }}>
          {Math.round((zoomPct || 1) * 100) + '%'}
        </span>
        <button id="zIn" title="Zoom in (+)" onClick={() => flowApi.current?.zoomIn()}>+</button>
      </div>
      <button id="z100" title="Zoom 100% (phím 1)" onClick={() => flowApi.current?.zoom100()}>1:1</button>
      <button id="btnFit" title="Fit toàn bộ graph (phím F)" onClick={() => flowApi.current?.fitView()}>Fit</button>

      <span className="tb-sep" />

      <button id="btnPNG" title="Xuất ảnh PNG nét vector (Shift+click = chụp đúng khung nhìn, kèm ô note)"
        onClick={(ev) => (ev.shiftKey ? onExportPNGView && onExportPNGView() : onExportPNG())}><IcDown /> PNG</button>
      <button id="btnSVG" title="Xuất vector SVG" onClick={onExportSVG}><IcDown /> SVG</button>
      <button id="btnExportDebug" className="attn" title="Xuất logic graph để debug" onClick={onExportDebug}>
        <IcBug /> Export Debug
      </button>

      <span className="tb-sep" />

      <button id="btnAIData" title="Xuất data hàm (JSON) cho AI phân tích · Shift+click = ẩn địa chỉ hex"
        onClick={(ev) => onAIData(!!ev.shiftKey)}><IcUp /> AI data</button>
      <button id="btnAIPrompt" title="Copy prompt + data để dán vào chat AI · Shift+click = ẩn địa chỉ hex"
        onClick={(ev) => onAIPrompt(!!ev.shiftKey)}><IcCopy /> AI prompt</button>
      <button id="btnImportNotes" title="Nạp JSON note do AI trả về" onClick={onImportNotes}><IcDown /> Notes</button>
      <button id="btnProse" className={proseOpen ? 'on' : undefined}
        title="Panel luồng logic chữ viết (tóm tắt từ AI)" onClick={onToggleProse}><IcBook /></button>
      <button id="btnMainPath" className={mainPathOn ? 'on' : undefined}
        title="Tô đậm luồng chính của hàm (từ tóm tắt AI)" onClick={onMainPath}><IcCompass /></button>

      <span className="tb-sep" />

      <button id="btnSession" title="Export session (Ctrl+S)" onClick={onSaveSession}><IcSave /> Save</button>
      <button id="btnImport" title="Import session (Ctrl+O)" onClick={onLoadSession}><IcDown /> Load</button>
      <button id="btnDbg" className={dbgOpen ? 'on' : undefined} title="Bật/tắt panel debug (F2)"
        onClick={onToggleDbg}><IcTerm /></button>
    </div>
  );
}
