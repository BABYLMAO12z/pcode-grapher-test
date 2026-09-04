/* =========================================================================
 * PCODE Grapher · src/ui/DebugPanel.jsx — HUD debug F2 (port js/ui/debug.js)
 * state JSON · log sự kiện · 📋 copy · 💥 kill (nhả focus/highlight kẹt) ·
 * ♻ rebuild · FPS (chỉ chạy rAF khi mở) · safe mode · thu gọn.
 * ========================================================================= */

import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore.js';
import { dbgSnapshot } from '../export/index.js';
import { IcBug, IcCopy } from './icons.jsx';

export default function DebugPanel({ flowApi, rebuild, onCopy }) {
  const open = useStore((s) => s.ui.dbgOpen);
  const dbgLog = useStore((s) => s.ui.dbgLog);
  const safeMode = useStore((s) => s.ui.safeMode);
  const setUi = useStore((s) => s.setUi);
  const [compact, setCompact] = useState(false);
  const [fps, setFps] = useState(0);

  // FPS counter — chỉ chạy rAF khi HUD đang mở (port initDebug: khi đóng, HUD
  // không được đốt CPU mỗi frame). v2 trước bỏ sót FPS + nút kill của bản cũ.
  useEffect(() => {
    if (!open) { setFps(0); return undefined; }
    let frames = 0, raf = 0, alive = true;
    const tick = () => { frames++; raf = requestAnimationFrame(tick); };
    try { raf = requestAnimationFrame(tick); } catch { /* jsdom */ }
    const iv = setInterval(() => {
      if (alive) { setFps(Math.round(frames * 1000 / 250)); frames = 0; }
    }, 250);
    return () => { alive = false; cancelAnimationFrame(raf); clearInterval(iv); };
  }, [open]);

  if (!open) return null;
  const snap = dbgSnapshot(flowApi?.current?.getView?.());

  return (
    <div id="dbg">
      <div className="dbd-title">
        <span><IcBug /> Debug HUD</span>
        <span>
          <span id="dbgFps" className={fps >= 45 ? 'good' : 'bad'}>{fps + ' fps'}</span>{' '}
          <button className="compToggle" id="dbgCompact" title="Thu gọn"
            onClick={() => setCompact((c) => !c)}>{compact ? '+' : '−'}</button>
          <button id="dbgHide" title="Đóng (F2)" onClick={() => setUi({ dbgOpen: false })}>×</button>
        </span>
      </div>
      {!compact ? (
        <>
          <div id="dbgState">{JSON.stringify(snap, null, 1)}</div>
          <div id="dbgLog">
            {dbgLog.slice(-40).map((l, i) => (
              <div key={i} className="dbd-row">
                <span className="t">{new Date(l.t).toLocaleTimeString()}</span> {l.msg}
              </div>
            ))}
          </div>
          <div className="row">
            <button id="dbgCopy" title="Copy debug info gửi dev"
              onClick={() => onCopy && onCopy(JSON.stringify(snap, null, 1))}><IcCopy /> copy</button>
            <button id="dbgKill" title="Nhả mọi trạng thái focus/highlight bị kẹt (port dbgKill cũ)"
              onClick={() => flowApi?.current?.killStuck?.()}>kill</button>
            <button id="dbgReb" title="Vẽ lại (giữ view — bản cũ dbgReb gọi build(true))" onClick={() => rebuild(true)}>rebuild</button>
            <label className="chk">
              <input type="checkbox" id="chkSafe" checked={!!safeMode}
                onChange={(e) => setUi({ safeMode: e.target.checked })} /> safe mode
            </label>
          </div>
        </>
      ) : null}
    </div>
  );
}
