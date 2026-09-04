/* =========================================================================
 * PCODE Grapher · src/notes/RichText.jsx — render NOTE text thành span màu
 * (thay text trơn): chip B#/E# bấm được khi có onJump (giữ nguyên hành vi
 * noteRefChip cũ), token code tô màu parity block qua richSegments().
 *
 * ctx (bảng tra biến/hàm ĐÃ RENAME của graph hiện tại) tự lấy từ store qua
 * colorCtxForGraph() — WeakMap cache theo graphData/liveNames reference nên
 * mọi <RichText> trong cùng graph chỉ build ctx ĐÚNG 1 LẦN.
 * ========================================================================= */

import { useStore } from '../store/useStore.js';
import { richSegments, colorCtxForGraph } from './richtext.js';

export default function RichText({ text, onJump = null, ctx = null }) {
  const graphData = useStore((s) => s.graphData);
  const liveNames = useStore((s) => s.liveNames);
  const c = ctx || colorCtxForGraph(graphData, liveNames);
  const segs = richSegments(text, c);
  return segs.map((g, i) => {
    if (g.t === 'ref') {
      return onJump ? (
        <span key={i} className="noteRefChip" role="button" tabIndex={0}
          title={'Nhảy tới ' + g.s}
          onClick={(ev) => { ev.stopPropagation(); onJump(g.s); }}
          onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.stopPropagation(); onJump(g.s); } }}>
          {g.s}
        </span>
      ) : (
        <span key={i} className="noteRefChip is-static">{g.s}</span>
      );
    }
    if (g.t === 'sp') {
      return (
        <span key={i} className={g.cls || undefined}
          style={g.color ? { color: g.color } : undefined}>
          {g.s}
        </span>
      );
    }
    return g.s; // chuỗi trơn — cùng array với element đã có key (như NoteWithChips cũ)
  });
}
