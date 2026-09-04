/* =========================================================================
 * PCODE Grapher · src/ui/hotkeys.js — phím tắt toàn cục (F8 trong FEATURES)
 * Port hotkeys của js/ui/main.js. Ở T5 làm phần NỀN:
 *   Ctrl+Enter build · Ctrl+Shift+Enter build lại từ đầu · Ctrl+F focus tìm ·
 *   Ctrl+1 zoom 100% · Ctrl+S save session · Ctrl+O load session · F fit ·
 *   1 zoom 100% · +/- zoom · mũi tên pan · N cycle notes · F2 debug HUD ·
 *   ? overlay phím tắt · Esc stack.
 * ========================================================================= */

const EDITABLE = new Set(['input', 'textarea', 'select']);

export function isTypingTarget(el) {
  if (!el) return false;
  const tag = (el.tagName || '').toLowerCase();
  return EDITABLE.has(tag) || el.isContentEditable === true;
}

/**
 * @param {object} h các hàm xử lý; thiếu hàm nào thì phím đó bỏ qua.
 * @returns {function} huỷ đăng ký
 */
export function installHotkeys(h = {}) {
  const onKeyDown = (e) => {
    const typing = isTypingTarget(e.target);
    const mod = e.ctrlKey || e.metaKey;

    // --- Ctrl+Enter: build (hoạt động CẢ khi đang gõ trong textarea) ---
    if (mod && e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) h.rebuildFresh?.();
      else h.build?.();
      return;
    }

    // FIX(30): nhánh Ctrl/Cmd trước đây `return` VÔ ĐIỀU KIỆN ở cuối, nên mọi tổ
    // hợp khác (Ctrl+Escape, Ctrl+F2, Ctrl+Shift+?) chết ở đây và không bao giờ
    // tới các nhánh phía dưới. Giờ chỉ thoát khi đã XỬ LÝ tổ hợp đó.
    if (mod) {
      const k = (e.key || '').toLowerCase();
      const combos = { s: h.saveSession, o: h.openSession, f: h.focusSearch, 1: h.zoom100 };
      const fn = combos[k];
      if (fn) {
        e.preventDefault();
        fn();
        return;
      }
      // không phải tổ hợp của app → đi tiếp (Esc/F2), nhưng KHÔNG chạy phím trần
    }

    // --- Esc: stack (search → note → overlay → focus) ---
    if (e.key === 'Escape') {
      if (h.escape?.()) e.preventDefault();
      return;
    }

    // F2: bật/tắt debug HUD — hoạt động cả khi con trỏ đang trong ô soạn thảo
    // (bản cũ bind ở document, không loại trừ input).
    if (e.key === 'F2') {
      e.preventDefault();
      h.toggleDebug?.();
      return;
    }

    // các phím trần: bỏ qua khi đang gõ hoặc khi đang giữ Ctrl/Cmd
    if (typing || mod) return;

    if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
      e.preventDefault();
      h.toggleHelp?.();
      return;
    }

    switch (e.key) {
      case 'n':
      case 'N':
        e.preventDefault();
        h.cycleNotes?.();
        break;
      case 'f':
      case 'F':
        e.preventDefault();
        h.fitView?.();
        break;
      case '1':
        e.preventDefault();
        h.zoom100?.();
        break;
      case '+':
      case '=':
        e.preventDefault();
        h.zoomIn?.();
        break;
      case '-':
      case '_':
        e.preventDefault();
        h.zoomOut?.();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        h.pan?.(-80, 0);
        break;
      case 'ArrowRight':
        e.preventDefault();
        h.pan?.(80, 0);
        break;
      case 'ArrowUp':
        e.preventDefault();
        h.pan?.(0, -80);
        break;
      case 'ArrowDown':
        e.preventDefault();
        h.pan?.(0, 80);
        break;
      default:
        break;
    }
  };

  document.addEventListener('keydown', onKeyDown);
  return () => document.removeEventListener('keydown', onKeyDown);
}
