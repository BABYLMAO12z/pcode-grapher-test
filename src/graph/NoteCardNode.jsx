/* =========================================================================
 * PCODE Grapher · src/graph/NoteCardNode.jsx — card note + ô note = NODE (D7)
 * PORT js/ui/notes-card.js phần giao diện: header dính (ref · state · ✎ · id · ✕),
 * CODE preview 3 dòng, ↪ NHÁNH RA, NOTE có chip ref, "nói ngắn", footer dính
 * (📋 note · 📋 code+note · ✏️ sửa · 📋 AI prompt), phiên sửa tay ✓ lưu / ↺ huỷ.
 * Việc đặt chỗ + nét nối do React Flow lo (xem src/notes/cards.js).
 * U8: class `nowheel` (noWheelClassName của RF) — wheel trên card/ô note = cuộn
 * NỘI DUNG native, không zoom graph (parity guard wheel của interact.js 1.9.3).
 * ========================================================================= */

import { memo, useState, useRef, useEffect } from 'react';
import { Handle, Position, BaseEdge, getSmoothStepPath } from '@xyflow/react';
import { NOTE_PANEL_W } from './constants.js';
import { NOTE_STATE_LABEL, NOTE_STATE_ICON } from '../notes/cards.js';
import RichText from '../notes/RichText.jsx';
import { IcEdit, IcCheck, IcUndo, IcCopy } from '../ui/icons.jsx';

export { NOTE_PANEL_W };

const STATE_TIP = {
  ok: 'Note này vẫn khớp với code hiện tại',
  stale: 'Code của block này đã đổi từ lúc AI viết note — đọc có thể lệch',
  orphan: 'Không còn block nào khớp note này (code đã xoá/viết lại)',
};

/** Text note → RichText: chip ref + token màu parity block
 * (src/notes/RichText.jsx — thay noteWithChips chỉ chip B#/E#, text còn trơn). */

function NoteCardNodeInner({ data = {} }) {
  const {
    savedRef, state = 'ok', type, nid, idx, data: saved = {},
    blockRef, code = '', outs = [], edgeInfo = null, isLive = false,
    onClose, onJump, onCopy, onCopyPrompt, onSaveEdit, onOpenEdgeNote, onCenterNode,
  } = data;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(saved.note || '');
  const taRef = useRef(null);

  // đổi card (ref khác) → bỏ dở phiên sửa, như bản cũ (noteEdit = null khi openNote)
  useEffect(() => { setEditing(false); setDraft(saved.note || ''); }, [savedRef, saved.note]);
  useEffect(() => { if (editing && taRef.current) { try { taRef.current.focus(); taRef.current.select(); } catch { /* jsdom */ } } }, [editing]);

  const codeLines = String(code).split('\n').filter((s) => s.trim());
  const preview = codeLines.slice(0, 3).join('\n') + (codeLines.length > 3 ? '\n…' : '');

  return (
    <>
      <Handle type="target" position={Position.Left} isConnectable={false} style={{ opacity: 0 }} />
      <div className="noteCard nowheel" id="noteCard" style={{ width: NOTE_PANEL_W }}
        onPointerDown={(ev) => ev.stopPropagation()}>

        {/* HEADER dính */}
        <div className="nc-head">
          <span className="nc-ref" title={(type === 'node' ? 'Note của block ' : 'Note của mũi tên ') + savedRef}>
            {savedRef}
          </span>
          <span className={'nc-state ' + state} title={STATE_TIP[state] || ''}>
            {NOTE_STATE_LABEL[state] || state}
          </span>
          {saved.manual ? (
            <span className="nc-manual" title="Bạn đã sửa tay note này — re-import sẽ KHÔNG ghi đè"><IcEdit size={12} /> manual</span>
          ) : null}
          <span className="nc-id" title={type === 'node'
            ? 'Block ' + blockRef + ' (số dùng trong note và 📤 AI data, B1 = block đầu) · node nội bộ #' + nid
            : ''}>
            {type === 'node' ? blockRef + ' · node #' + nid : edgeInfo ? edgeInfo.label : '?'}
          </span>
          <button type="button" className="nc-x nc-close" title="Đóng card (Esc)"
            onClick={(ev) => { ev.stopPropagation(); onClose && onClose(); }}>✕</button>
        </div>

        {/* BODY cuộn */}
        <div className="nc-body">
          {type === 'node' ? (
            <>
              <div className="nc-cap">
                CODE{isLive ? <span className="nc-live">· tên đang hiển thị (live)</span> : null}
              </div>
              <div className="nc-code" title={code}>{preview}</div>
              {outs.length ? (
                <>
                  <div className="nc-sub">{'↪ NHÁNH RA (' + outs.length + ')'}</div>
                  {outs.map((o) => (
                    <div key={o.idx} className="nc-edge"
                      title={(o.note || 'edge #' + o.from + ' → #' + o.to) + '\n(click: tô sáng mũi tên + mở note)'}
                      onClick={(ev) => { ev.stopPropagation(); onOpenEdgeNote && onOpenEdgeNote(o.idx); }}>
                      <span className="ec-k" style={{ background: o.color }}>{o.kindLabel}</span>
                      <span className="ec-t">{o.note ? (o.note.length > 90 ? o.note.slice(0, 90) + '…' : o.note) : '—'}</span>
                      <span className="ec-go">↗</span>
                    </div>
                  ))}
                </>
              ) : null}
            </>
          ) : (
            <span className="ec-k" style={{ background: edgeInfo && edgeInfo.color }}>
              {edgeInfo ? 'edge ' + edgeInfo.kind + (edgeInfo.elabel ? ' · ' + edgeInfo.elabel : '') : 'edge ?'}
            </span>
          )}

          <div className="nc-cap">NOTE</div>
          <div className="nc-note">
            {editing ? (
              <textarea ref={taRef} className="nc-edit" spellCheck={false} value={draft}
                rows={Math.min(10, Math.max(3, String(saved.note || '').split('\n').length + 1))}
                title="Sửa note — ✓ lưu hoặc ↺ huỷ (Esc đóng card = bỏ dở)"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()} />
            ) : (
              <RichText text={saved.note || ''} onJump={onJump} />
            )}
          </div>
          {type === 'node' && saved.plain ? (
            <div className="nc-plain" title="Diễn giải ngắn, không thuật ngữ">{saved.plain}</div>
          ) : null}
          {type === 'edge' && edgeInfo && edgeInfo.links ? (
            <>
              <div className="nc-sub">BLOCK LIÊN QUAN</div>
              {edgeInfo.links.map((L, i) => (
                <span key={L.nid} className="nc-link" title={'Nhảy tới block ' + L.label}
                  onClick={(ev) => { ev.stopPropagation(); onCenterNode && onCenterNode(L.nid); }}>
                  {(i === 0 ? '↳ đầu ' : '↳ cuối ') + L.label}
                </span>
              ))}
            </>
          ) : null}
        </div>

        {/* FOOTER dính */}
        <div className="nc-btns">
          {editing ? (
            <>
              <button type="button" className="nc-editing-only"
                onClick={(ev) => { ev.stopPropagation(); setEditing(false); onSaveEdit && onSaveEdit(savedRef, draft, saved.note || ''); }}>
                <IcCheck /> lưu
              </button>
              <button type="button" className="nc-editing-only"
                onClick={(ev) => { ev.stopPropagation(); setEditing(false); setDraft(saved.note || ''); }}>
                <IcUndo /> huỷ
              </button>
            </>
          ) : null}
          <button type="button" title="Copy riêng phần chữ note"
            onClick={(ev) => { ev.stopPropagation(); onCopy && onCopy(saved.note || ''); }}><IcCopy /> note</button>
          {type === 'node' ? (
            <button type="button" title="Copy code (tên đang hiển thị) kèm note — dán vào chat AI"
              onClick={(ev) => { ev.stopPropagation(); onCopy && onCopy('[' + savedRef + '] ' + code + '\n\n' + (saved.note || '')); }}>
              <IcCopy /> code+note
            </button>
          ) : null}
          <button type="button" className="primary"
            title="Sửa tay note này (đánh dấu manual — re-import không ghi đè)"
            onClick={(ev) => { ev.stopPropagation(); setEditing(true); }}><IcEdit /> sửa</button>
          <button type="button" title="Copy prompt hỏi AI RIÊNG về block/mũi tên này"
            onClick={(ev) => { ev.stopPropagation(); onCopyPrompt && onCopyPrompt(savedRef, state); }}><IcCopy /> AI prompt</button>
        </div>
      </div>
    </>
  );
}

/** Ô note cạnh block (mode "full") — LUÔN HIỆN, bôi đen / TTS được. */
function NotePanelNodeInner({ data = {} }) {
  const { savedRef, state = 'ok', note, plain, manual } = data;
  return (
    <div className={'notePanel nowheel ' + state} style={{ width: NOTE_PANEL_W }} data-saved-ref={savedRef}>
      <div className="np-head">
        <span className="np-ref">{savedRef}</span>
        <span className={'np-st ' + state}>
          {state === 'ok' ? '✓' : state === 'stale' ? '⚠ code đã đổi' : '✗ không tìm thấy'}
        </span>
        {manual ? <span className="np-manual" title="Note đã sửa tay — re-import không ghi đè"><IcEdit size={11} /></span> : null}
      </div>
      <div className="np-note"><RichText text={note} /></div>
      {plain ? <div className="np-plain">{plain}</div> : null}
    </div>
  );
}

/** Nét nối block ↔ card: đứt nét tím (D7). */
function NoteConnEdgeInner({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition }) {
  const [path] = getSmoothStepPath({
    sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 8,
  });
  return (
    <BaseEdge id={id} path={path} className="noteConn"
      style={{ stroke: 'var(--note-line, #a78bfa)', strokeWidth: 1.4, strokeDasharray: '4 4' }} />
  );
}

export { NOTE_STATE_LABEL, NOTE_STATE_ICON };
export const NoteCardNode = memo(NoteCardNodeInner);
export const NotePanelNode = memo(NotePanelNodeInner);
export const NoteConnEdge = memo(NoteConnEdgeInner);
export default NoteCardNode;
