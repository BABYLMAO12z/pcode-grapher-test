/* =========================================================================
 * PCODE Grapher · src/notes/ProsePanel.jsx — 📖 panel luồng logic (port notes-panel.js)
 * 3 mục: 🧭 LUỒNG CHUNG (câu đánh số, hover tô block, click nhảy) ·
 * ⚡ TÁC ĐỘNG LÊN HỆ THỐNG · ❓ ĐIỂM CHƯA RÕ (checklist + tiến độ).
 * ========================================================================= */

import { useState, useCallback, useEffect } from 'react';
import { useStore } from '../store/useStore.js';
import { applyMainPath, refsOfSentence, jumpToRef, openNoteForEdge, applyProsePl, focusEdgeByIdx } from './ui.js';
import RichText from './RichText.jsx';
import { IcBook, IcCompass, IcBolt, IcHelp } from '../ui/icons.jsx';

export default function ProsePanel({ onClose, onCenterNode }) {
  const notes = useStore((s) => s.notes);
  const mainPathOn = useStore((s) => s.mainPathOn);
  // set từ FlowView khi click block lúc panel đang mở (highlightSentenceForNode)
  const plNodeRef = useStore((s) => s.plNodeRef);
  const [checked, setChecked] = useState({});

  // hover câu → tô .pl block/edge liên quan TRÊN GRAPH (port proseSentencePl;
  // trước đây chỉ set attribute data-pl mà không ai đọc → hover không làm gì)
  const hover = useCallback((sentence, on) => {
    if (!notes || !notes.match) return;
    applyProsePl(refsOfSentence(notes, sentence), on);
  }, [notes]);

  // rời panel: gỡ mọi .pl sót lại (port clearProsePl khi đóng)
  useEffect(() => () => applyProsePl([], false), []);

  if (!notes) return null;
  const sum = notes.summary || { sentences: [], sideEffects: [], unknowns: [] };
  const doneCount = Object.values(checked).filter(Boolean).length;

  return (
    <div id="prosePanel">
      <div className="pp-head">
        <span className="pp-ttl">
          <IcBook /> LUỒNG LOGIC
          {notes.meta && notes.meta.fn ? (
            <span className="pp-fn" title={'Tóm tắt này của hàm ' + notes.meta.fn}>{'· ' + notes.meta.fn}</span>
          ) : null}
        </span>
        <span className="pp-count" title={sum.sentences.length + ' câu mô tả luồng' +
          (sum.sideEffects.length ? ' · ' + sum.sideEffects.length + ' tác động' : '') +
          (sum.unknowns.length ? ' · ' + sum.unknowns.length + ' điểm chưa rõ' : '')}>
          {sum.sentences.length + ' bước'}
        </span>
        <span className="pp-grow" />
        <button type="button" className={mainPathOn ? 'on' : ''}
          title="Tô đậm / tắt luồng chính của hàm (theo tóm tắt AI)"
          onClick={(ev) => { ev.stopPropagation(); applyMainPath(); }}>
          <IcCompass /> {mainPathOn ? 'Tắt luồng chính' : 'Luồng chính'}
        </button>
        <button type="button" title="Đóng panel" onClick={(ev) => { ev.stopPropagation(); onClose && onClose(); }}>✕</button>
      </div>

      <div className="pp-body">
        <div className="pp-section">
          <div className="pp-sub"><IcCompass /> LUỒNG CHUNG</div>
          {!sum.sentences.length ? (
            <div className="pp-empty">
              {'AI không trả phần tóm tắt. Vẫn đọc được note từng block: bật '}
              <b title="HUD góc trái-trên → Đầy đủ">Đầy đủ</b>
              {' hoặc click dấu ✓/⚠/✗ trên block.'}
            </div>
          ) : null}
          {sum.sentences.map((s, i) => (
            <p key={i}
              className={'pp-sentence' + (plNodeRef && (s.refs || []).includes(plNodeRef) ? ' pl' : '')}
              data-idx={i} data-num={i + 1}
              data-refs={(s.refs || []).join(',')}
              title={'Hover: tô sáng block liên quan · Click: nhảy tới ' + ((s.refs || [])[0] || '…')}
              onMouseEnter={() => hover(s, true)}
              onMouseLeave={() => hover(s, false)}
              onClick={() => {
                const first = (s.refs || [])[0];
                if (!first) return;
                if (first[0] === 'B') {
                  const v = notes.match && notes.match.byRef[first];
                  if (v && v.nodeId != null && onCenterNode) onCenterNode(v.nodeId);
                } else {
                  const v = notes.match && notes.match.edgeByRef[first];
                  if (v && v.idx != null) { focusEdgeByIdx(v.idx); openNoteForEdge(v.idx); }
                }
              }}>
              <RichText text={s.text} onJump={(ref) => jumpToRef(ref, { centerNode: onCenterNode })} />{' '}
              {(s.refs || []).map((ref) => (
                <span key={ref} className="noteRefChip" title={'Nhảy tới ' + ref}
                  onClick={(ev) => { ev.stopPropagation(); jumpToRef(ref, { centerNode: onCenterNode }); }}>
                  {ref}
                </span>
              ))}
            </p>
          ))}
        </div>

        {sum.sideEffects.length ? (
          <div className="pp-section">
            <div className="pp-sub"><IcBolt /> TÁC ĐỘNG LÊN HỆ THỐNG</div>
            <ul className="pp-list">{sum.sideEffects.map((t, i) => <li key={i}><RichText text={t} /></li>)}</ul>
          </div>
        ) : null}

        {sum.unknowns.length ? (
          <div className="pp-section">
            <div className="pp-sub">
              <IcHelp /> ĐIỂM CHƯA RÕ
              <span className="pp-prog" title={doneCount === sum.unknowns.length
                ? 'Đã kiểm chứng hết các điểm AI chưa chắc'
                : 'Tick khi bạn đã tự kiểm chứng trong Ghidra'}>
                {doneCount + '/' + sum.unknowns.length + ' đã kiểm chứng'}
              </span>
            </div>
            <ul className="pp-checks">
              {sum.unknowns.map((t, i) => (
                <li key={i} className={checked[i] ? 'done' : ''}>
                  <label>
                    <input type="checkbox" checked={!!checked[i]}
                      onChange={(e) => setChecked((c) => ({ ...c, [i]: e.target.checked }))} />
                    <span>{t}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
