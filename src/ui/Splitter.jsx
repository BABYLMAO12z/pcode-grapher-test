/* =========================================================================
 * PCODE Grapher · src/ui/Splitter.jsx — vạch kéo đổi độ rộng panel trái (F18)
 * Kéo = đổi sideW (min 280 theo D11) · double-click = reset về mặc định ·
 * bàn phím ←/→ đổi 16px. Giá trị lưu localStorage `pcode.sideW`.
 * ========================================================================= */

import { useCallback, useEffect, useRef } from 'react';
import { useStore } from '../store/useStore.js';

export const SIDE_MIN = 280;
export const SIDE_DEFAULT = 430; // = #side{width:430px} trong CSS (bản cũ dbl-click reset về 430)
export const SIDE_MAX_RATIO = 0.72; // bản cũ: max 72% cửa sổ (v2 trước ghi nhầm 0.6)

/** Kẹp bề rộng panel vào [SIDE_MIN, 72% cửa sổ] — y hệt initSplitter cũ. */
export function clampSideW(px, winW = 1280) {
  const max = Math.max(SIDE_MIN, Math.round(winW * SIDE_MAX_RATIO));
  return Math.min(max, Math.max(SIDE_MIN, Math.round(px)));
}

export default function Splitter() {
  const sideW = useStore((s) => s.ui.sideW);
  const setSideW = useStore((s) => s.setSideW);
  const dragging = useRef(false);

  const onMove = useCallback((ev) => {
    if (!dragging.current) return;
    setSideW(clampSideW(ev.clientX, window.innerWidth));
  }, [setSideW]);

  const onUp = useCallback(() => { dragging.current = false; document.body.classList.remove('resizing'); }, []);

  const resetSideW = useStore((s) => s.resetSideW);

  useEffect(() => {
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [onMove, onUp]);

  return (
    <div id="splitter" role="separator" aria-orientation="vertical" tabIndex={0}
      aria-label="Kéo để đổi độ rộng panel · double-click reset"
      title="Kéo để đổi độ rộng panel · double-click reset"
      onPointerDown={() => { dragging.current = true; document.body.classList.add('resizing'); }}
      onDoubleClick={() => resetSideW()}
      onKeyDown={(ev) => {
        const cur = sideW || SIDE_DEFAULT;
        if (ev.key === 'ArrowLeft') { ev.preventDefault(); setSideW(clampSideW(cur - 16, window.innerWidth)); }
        else if (ev.key === 'ArrowRight') { ev.preventDefault(); setSideW(clampSideW(cur + 16, window.innerWidth)); }
        else if (ev.key === 'Home') { ev.preventDefault(); resetSideW(); }
      }} />
  );
}
