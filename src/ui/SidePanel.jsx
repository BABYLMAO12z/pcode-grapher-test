/* =========================================================================
 * PCODE Grapher · src/ui/SidePanel.jsx — panel trái (port khối #side index.html)
 * Các mục: MÃ NGUỒN · 🔗 GHIDRA LIVE · TÙY CHỌN HIỂN THỊ · HIGHLIGHT ·
 * CHÚ THÍCH MÀU · CHUỘT & PHÍM TẮT. Giữ nguyên id/class để CSS cũ áp đúng.
 * ========================================================================= */

import { useCallback, useMemo, useRef, useState } from 'react';
import { useStore } from '../store/useStore.js';
import { SAMPLE } from '../sample.js';
import { SRC_MAX_BYTES, readSectCollapsed, writeSectCollapsed } from '../store/persistence.js';
import { setSearchOption } from './highlight.js';
import { clearNotes } from '../notes/index.js';
import { refreshNoteNodes } from '../notes/ui.js';
import SearchBar from './SearchBar.jsx';
import GhidraPanel from '../ghidra/GhidraPanel.jsx';

const LEGEND = [
  ['lg-kw', 'keyword'], ['lg-ty', 'type'], ['lg-fn', 'function'], ['lg-gop', 'ghidra-op'],
  ['lg-addr', 'FUN_/DAT_/PTR_/LAB_'], ['lg-num', 'number'], ['lg-str', 'string'],
  ['lg-com', 'comment'], ['lg-var', 'mỗi biến 1 màu'], ['lg-seq', 'nền prologue'],
  ['lg-ctl', 'nền if/while/for'],
];

/** Whitelist extension — y hệt initDragDrop/btnLoad của main.js cũ. */
const OK_EXT = /^(c|cpp|cc|cxx|h|hpp|java|txt|js|ts|py|go|rs|md|json)$/;
export const SOURCE_ACCEPT = '.c,.cpp,.cc,.cxx,.h,.hpp,.txt,.java,.js,.ts,.py,.go,.rs,.md,.json';

/** Đọc file vào ô nguồn + build lại (port load() của initDragDrop cũ —
 * v2 trước bỏ sót check >2MB, whitelist extension và toast xác nhận). */
export function loadSourceFile(file, rebuild) {
  if (!file) return;
  const st = useStore.getState();
  if (file.size > SRC_MAX_BYTES) { st.toast('File quá lớn (>2 MB)'); return; }
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!OK_EXT.test(ext)) { st.toast('Chỉ hỗ trợ file .c/.cpp/.h/.txt/.java…'); return; }
  const rd = new FileReader();
  rd.onload = () => {
    st.setSrc(String(rd.result || ''));
    rebuild && rebuild(false);
    st.toast('Đã nạp "' + file.name + '"');
  };
  rd.onerror = () => useStore.getState().toast('Không đọc được file');
  rd.readAsText(file);
}

/** Section panel trái có thể gập (click tiêu đề) — port initSectionCollapse
 *  của main.js cũ: persist vào pcode.coll.i<idx> (helpers đã có sẵn trong
 *  persistence.js nhưng không ai dùng). */
function Sect({ idx, title, className, collapsed, onToggle, children }) {
  return (
    <div className={'sect' + (className ? ' ' + className : '') + (collapsed ? ' collapsed' : '')}>
      <div className="sect-t" role="button" aria-expanded={!collapsed}
        onClick={() => onToggle(idx)}>{title}</div>
      {children}
    </div>
  );
}

export default function SidePanel({ width, rebuild, onCenterNode, onSourceEdited }) {
  const src = useStore((s) => s.src);
  const opts = useStore((s) => s.opts);
  const warn = useStore((s) => s.ui.warn);
  const errLine = useStore((s) => s.ui.errLine);
  const setSrc = useStore((s) => s.setSrc);
  const setOpts = useStore((s) => s.setOpts);
  const fileRef = useRef(null);
  // Thứ tự section cố định như index.html cũ → key pcode.coll.i<idx> khớp 2 bản.
  const [collapsed, setCollapsed] = useState(() => [0, 1, 2, 3, 4, 5].map(readSectCollapsed));
  const toggleSect = useCallback((idx) => {
    setCollapsed((cur) => {
      const next = cur.slice();
      next[idx] = !next[idx];
      writeSectCollapsed(idx, next[idx]);
      return next;
    });
  }, []);

  const lineCount = useMemo(() => Math.max(1, src.split('\n').length), [src]);

  // đồng bộ cuộn textarea → cột số dòng (bản cũ: $('#src') scroll → ln.scrollTop).
  const onSrcScroll = useCallback((ev) => {
    const ln = document.getElementById('lineNums');
    if (ln) ln.scrollTop = ev.target.scrollTop;
  }, []);

  const changeOpts = useCallback(async (patch) => {
    setOpts(patch);
    // bản cũ chỉ rebuild khi có nguồn — ô trống thì đổi tuỳ chọn không vẽ/cảnh báo
    if (!useStore.getState().src.trim()) return;
    await rebuild(true); // giữ view; highlight/manualPos KHÔNG bị mất (store giữ)
  }, [setOpts, rebuild]);

  const openFile = useCallback((file) => loadSourceFile(file, rebuild), [rebuild]);

  /** Nút Clear — port đầy đủ btnClear cũ: trả UI về "chưa có gì" (bản React
   *  trước chỉ setSrc('') + rebuild → notes/highlight/manualPos/scope treo lại,
   *  và build nguồn rỗng còn in cảnh báo "Paste pseudocode trước" sau khi Clear). */
  const clearAll = useCallback(() => {
    const st = useStore.getState();
    st.clearWorkspace();
    clearNotes(false);
    refreshNoteNodes();
  }, []);

  return (
    <div id="side" style={width ? { width, flex: '0 0 auto' } : undefined}>
      <Sect idx={0} title="MÃ NGUỒN PSEUDOCODE" className="grow" collapsed={collapsed[0]} onToggle={toggleSect}>
        <div className="row">
          <button id="btnBuild" className="primary" title="Phân tích & vẽ graph (Ctrl+Enter)"
            onClick={() => rebuild(false)}>▶ Build graph</button>
          <button id="btnSample" title="Nạp ví dụ mẫu"
            onClick={() => { setSrc(SAMPLE); rebuild(false); }}>Sample</button>
          <button id="btnClear" title="Xóa source và graph" onClick={clearAll}>Clear</button>
          <button id="btnLoad" title="Mở file (Ctrl+O)" onClick={() => fileRef.current?.click()}>Open</button>
          <input ref={fileRef} type="file" accept={SOURCE_ACCEPT} style={{ display: 'none' }}
            onChange={(ev) => { openFile(ev.target.files && ev.target.files[0]); ev.target.value = ''; }} />
          <select id="selPreset" title="Mật độ layout" value={opts.preset}
            onChange={(e) => changeOpts({ preset: e.target.value })}>
            <option value="compact">Compact</option>
            <option value="normal">Normal</option>
            <option value="wide">Wide</option>
          </select>
          <button id="btnDir" title="Đổi hướng graph dọc/ngang"
            onClick={() => changeOpts({ rankdir: opts.rankdir === 'TB' ? 'LR' : 'TB' })}>
            {opts.rankdir === 'TB' ? '↕ TB' : '↔ LR'}
          </button>
        </div>
        <div className="srcWrap"
          onDragOver={(ev) => ev.preventDefault()}
          onDrop={(ev) => { ev.preventDefault(); openFile(ev.dataTransfer.files && ev.dataTransfer.files[0]); }}>
          <div id="lineNums" aria-hidden="true">
            {Array.from({ length: lineCount }, (_, i) => (
              <span key={i} className={errLine === i + 1 ? 'err' : undefined}>{i + 1}</span>
            ))}
          </div>
          <textarea id="src" spellCheck={false} aria-label="Mã nguồn pseudocode"
            placeholder="Paste decompiled function (Ghidra/IDA) vào đây rồi nhấn Build graph (Ctrl+Enter)..."
            value={src}
            onChange={(e) => { setSrc(e.target.value); onSourceEdited && onSourceEdited(); }}
            onScroll={onSrcScroll} />
        </div>
      </Sect>

      <Sect idx={1} title="GHIDRA LIVE" collapsed={collapsed[1]} onToggle={toggleSect}>
        <GhidraPanel rebuild={rebuild} />
      </Sect>

      <Sect idx={2} title="TÙY CHỌN HIỂN THỊ" collapsed={collapsed[2]} onToggle={toggleSect}>
        <div className="row">
          <label className="chk">
            <input type="checkbox" id="optVars" checked={opts.colorVars}
              onChange={(e) => changeOpts({ colorVars: e.target.checked })} /> Màu theo biến
          </label>
          <label className="chk">
            <input type="checkbox" id="optDim" checked={opts.dim}
              onChange={(e) => setSearchOption('dim', e.target.checked)} /> Làm mờ phần còn lại khi highlight
          </label>
        </div>
      </Sect>

      <Sect idx={3} title="HIGHLIGHT (GIỐNG IDA)" collapsed={collapsed[3]} onToggle={toggleSect}>
        <SearchBar onCenterNode={onCenterNode} />
        <div id="warn" className={warn ? 'on' : undefined}>{warn}</div>
      </Sect>

      <Sect idx={4} title="CHÚ THÍCH MÀU" collapsed={collapsed[4]} onToggle={toggleSect}>
        <div className="legend">
          {LEGEND.map(([cls, label]) => (
            <span key={cls}><i className={cls} />{label}</span>
          ))}
        </div>
      </Sect>

      <Sect idx={5} title="CHUỘT &amp; PHÍM TẮT" collapsed={collapsed[5]} onToggle={toggleSect}>
        <div className="hint">
          <b>Chuột trái</b>: kéo = pan · click token = highlight · <kbd>Ctrl</kbd>+click = multi-highlight ·
          click edge = xem nối · <b>phải</b>: click block = copy code ·
          kéo block = sắp xếp · dbl-click block = zoom tới · dbl-click nền = fit ·{' '}
          <kbd>←→↑↓</kbd> pan · <kbd>+</kbd><kbd>−</kbd> zoom · <kbd>F</kbd> fit · <kbd>1</kbd> 100% ·{' '}
          <kbd>N</kbd> notes · <kbd>Esc</kbd> bỏ chọn · <kbd>F2</kbd> debug · <kbd>?</kbd> phím tắt ·
          kéo vạch ngăn panel để đổi độ rộng · <b>kéo-thả file</b> .c/.txt vào ô mã hoặc vùng graph để nạp
        </div>
      </Sect>
    </div>
  );
}
