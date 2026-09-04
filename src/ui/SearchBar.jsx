/* =========================================================================
 * PCODE Grapher · src/ui/SearchBar.jsx — ô highlight + 4 tuỳ chọn + prev/next
 * Port phần DOM của js/ui/search.js (initSearch): debounce 120ms, Enter = kế
 * tiếp, Shift+Enter = trước, Esc = xoá.
 * ========================================================================= */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../store/useStore.js';
import { setSearchKey, setSearchOption, stepHl, clearHighlight } from './highlight.js';

const OPTS = [
  ['searchCase', 'Aa', 'Phân biệt hoa thường'],
  ['searchRegex', '.*', 'Biểu thức chính quy'],
  ['searchWord', '\\b', 'Khớp trọn từ'],
  ['searchSolo', 'solo', 'Chỉ hiện block khớp'],
];

export default function SearchBar({ onCenterNode }) {
  const opts = useStore((s) => s.opts);
  const hlInfo = useStore((s) => s.ui.hlInfo || '');
  const hlOrder = useStore((s) => s.hlOrder);
  const hlIdx = useStore((s) => s.hlIdx);
  const [value, setValue] = useState('');
  const timer = useRef(null);
  const inputRef = useRef(null);

  // Debounce 120ms: gõ từng ký tự mà quét toàn graph thì vài trăm block là đơ.
  const schedule = useCallback((v) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        setSearchKey(v);
      } catch {
        /* regex sai cú pháp — bỏ qua như bản cũ */
      }
    }, 120);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  const step = useCallback(
    (dir) => {
      const r = stepHl(dir);
      if (r && onCenterNode) onCenterNode(r.nid);
    },
    [onCenterNode]
  );

  const clear = useCallback(() => {
    setValue('');
    clearTimeout(timer.current);
    clearHighlight();
  }, []);

  return (
    <div className="searchWrap">
      <div className="row">
        <input
          id="hlInput"
          ref={inputRef}
          type="text"
          placeholder="Tô sáng biến / hàm / text…"
          aria-label="Tìm và tô sáng"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            schedule(e.target.value.trim());
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              step(e.shiftKey ? -1 : 1);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation(); // bản cũ: Esc TRONG ô tìm chỉ clearHl, không chạy stack Esc toàn cục
              clear();
            }
          }}
        />
        <button id="hlClear" type="button" title="Xoá tô sáng (Esc)" onClick={() => { clear(); inputRef.current?.focus(); }}>
          ✕
        </button>
      </div>

      <div className="searchOpts">
        {OPTS.map(([key, label, title]) => (
          <label className="chk" key={key} title={title}>
            <input
              type="checkbox"
              checked={!!opts[key]}
              onChange={(e) => setSearchOption(key, e.target.checked)}
            />
            {label}
          </label>
        ))}
        <label className="chk" title="Làm mờ phần không khớp">
          <input type="checkbox" checked={!!opts.dim} onChange={(e) => setSearchOption('dim', e.target.checked)} />
          dim
        </label>
      </div>

      <div id="hlInfo">
        {hlInfo}
        {hlOrder.length > 1 ? (
          <>
            {' · '}
            <span className="hlNav" role="button" tabIndex={0} onClick={() => step(-1)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && step(-1)}>‹ trước</span>
            <span className="hlPos">{hlIdx >= 0 ? ` ${hlIdx + 1}/${hlOrder.length} ` : ' '}</span>
            <span className="hlNav" role="button" tabIndex={0} onClick={() => step(1)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && step(1)}>sau ›</span>
          </>
        ) : null}
      </div>
    </div>
  );
}
