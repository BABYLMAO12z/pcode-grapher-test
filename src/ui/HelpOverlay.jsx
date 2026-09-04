/* =========================================================================
 * PCODE Grapher · src/ui/HelpOverlay.jsx — overlay phím tắt (phím ?) — port #keyOverlay
 * ========================================================================= */

import { useStore } from '../store/useStore.js';

export default function HelpOverlay() {
  const open = useStore((s) => s.ui.helpOpen);
  const setUi = useStore((s) => s.setUi);
  if (!open) return null;
  const close = () => setUi({ helpOpen: false });

  return (
    <div id="keyOverlay" role="dialog" aria-modal="true" aria-label="Phím tắt"
      onPointerDown={(ev) => { if (ev.target.id === 'keyOverlay') close(); }}>
      <div className="keyHelp">
        <button className="close" id="keyClose" aria-label="Đóng" onClick={close}>×</button>
        <h3>⌨️ Phím tắt</h3>
        <p><kbd>F</kbd> Fit toàn bộ graph · <kbd>1</kbd> Zoom 100% · <kbd>+</kbd> / <kbd>−</kbd> Zoom in/out</p>
        <p><kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> Pan graph · <kbd>Esc</kbd> Đóng card note / bỏ chọn</p>
        <p><kbd>N</kbd> AI notes: tắt → badge ✓/⚠/✗ → ô note cạnh mỗi block (bôi đen/chuột phải đọc TTS được)
          — hoặc bấm thẳng trên HUD góc trái-trên</p>
        <p><kbd>Ctrl</kbd>+<kbd>Enter</kbd> Build graph · <kbd>Ctrl</kbd>+<kbd>F</kbd> Tìm ·
          <kbd>Ctrl</kbd>+<kbd>S</kbd> Save session · <kbd>Ctrl</kbd>+<kbd>O</kbd> Load session ·
          <kbd>F2</kbd> Bật/tắt Debug HUD</p>
        <p><kbd>?</kbd> Hiện overlay này</p>
        <hr style={{ border: 'none', borderTop: '1px solid var(--line)', margin: '10px 0' }} />
        <p><b>Chuột:</b> trái = pan · click token = highlight · Ctrl+click = multi-highlight ·
          click edge = xem nối</p>
        <p>kéo block = sắp xếp (lưu manualPos) · dbl-click block = zoom tới · dbl-click nền = fit ·
          chuột phải block = copy code · click badge ✓/⚠/✗ = đọc note · click edge = xem nối + note</p>
      </div>
    </div>
  );
}
