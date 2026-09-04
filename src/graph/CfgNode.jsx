/* =========================================================================
 * PCODE Grapher · src/graph/CfgNode.jsx — custom node React Flow
 * THAY buildNodeEl() của js/ui/graph.js: giữ NGUYÊN class/tag/aria/cấu trúc DOM
 * để CSS cũ (.node/.ln/.tk/.tag/.coll/.more) áp đúng và measureNodes đo == render.
 * ========================================================================= */

import { memo, useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';
import { classifyId, varColor } from '../core/colors.js';
import { isEntryNode } from '../core/cfg.js';
import { needSpace } from '../ui/tokens.js';
import { collapsibleBlock, HEAD_L, TAIL_L } from './constants.js';
import { NOTE_STATE_LABEL } from '../notes/cards.js';

/* Token render bằng component (không dangerouslySetInnerHTML) để click token dễ
 * và hiển thị tên live (D8). Khoảng cách dùng CHÍNH needSpace của tokens.js nên
 * output text trùng với renderToks/plainToks. */
function Tok({ toks, i, colorVars, liveNames, onTokenClick, tokOn }) {
  const tk = toks[i];
  const sp = needSpace(toks[i - 2], toks[i - 1], tk) ? ' ' : '';
  const raw = tk.v;

  if (tk.t === 'com' || tk.t === 'str' || tk.t === 'num') {
    return <>{sp}<span className={'tk ' + tk.t}>{raw}</span></>;
  }
  if (tk.t !== 'id') {
    return <>{sp}<span className="tk op">{raw}</span></>;
  }

  const cls = classifyId(toks, i);
  // D8: tên live từ Ghidra thay tên decompiler, nhưng data-key GIỮ tên gốc
  // (highlight/notes/anchor đều khoá theo tên gốc trong source).
  const shown = (liveNames && liveNames.get(raw)) || raw;
  const style = cls === 'var' && colorVars ? { color: varColor(raw) } : undefined;
  // .tk.on: token khớp search (port e.classList.add('on') của bản cũ)
  const onCls = tokOn && tokOn.has(raw) ? ' on' : '';
  return (
    <>
      {sp}
      <span
        className={'tk ' + cls + onCls}
        data-key={raw}
        style={style}
        onClick={onTokenClick ? (e) => { e.stopPropagation(); onTokenClick(raw, e.ctrlKey || e.metaKey); } : undefined}
      >
        {shown}
      </span>
    </>
  );
}

function Line({ line, seqBg, colorVars, liveNames, onTokenClick, tokOn }) {
  let cls = 'ln';
  let body;
  if (line.ctl) cls = 'ln ln-ctl ln-ctl-' + line.ctl;
  else if (line.comment !== undefined) cls = 'ln ln-com';
  else if (line.text !== undefined) cls = 'ln ln-lbl';
  else if (seqBg) cls = 'ln ln-seq';

  if (line.comment !== undefined) body = <span className="tk com">{line.comment}</span>;
  else if (line.text !== undefined) body = <span className="tk lbl">{line.text}</span>;
  else {
    const toks = line.toks || [];
    body = (
      <>
        {toks.map((_, i) => (
          <Tok key={i} toks={toks} i={i} colorVars={colorVars} liveNames={liveNames} onTokenClick={onTokenClick} tokOn={tokOn} />
        ))}
        {line.semi ? <span className="tk op">;</span> : null}
        {!toks.length && line.semi === undefined ? '\u00a0' : null}
      </>
    );
  }
  return <div className={cls}>{body}</div>;
}

function CfgNodeInner({ data }) {
  const {
    cfgNode: n, ref: blockRef, colorVars, liveNames, expanded,
    note, noteState, noteRef, noteOpen, mainPath, lit, dimmed, focus, focus2, pinned,
    hit, tokOn, pl,
    onTokenClick, onToggleExpand, onOpenNote, notesMode,
  } = data;

  const seqBg = n.lines.some((l) => l.ctl);
  const tot = n.lines.length;
  const canCollapse = collapsibleBlock(n);

  const handleMore = useCallback(
    (e) => {
      e.stopPropagation();
      if (onToggleExpand) onToggleExpand(n.id);
    },
    [onToggleExpand, n.id]
  );

  const lineProps = { seqBg, colorVars, liveNames, onTokenClick, tokOn };
  let content;
  if (canCollapse) {
    const head = n.lines.slice(0, HEAD_L);
    const mid = n.lines.slice(HEAD_L, tot - TAIL_L);
    const tail = n.lines.slice(tot - TAIL_L);
    content = (
      <>
        {head.map((l, i) => <Line key={'h' + i} line={l} {...lineProps} />)}
        <div className="coll" style={expanded ? undefined : { display: 'none' }}>
          {mid.map((l, i) => <Line key={'m' + i} line={l} {...lineProps} />)}
        </div>
        {tail.map((l, i) => <Line key={'t' + i} line={l} {...lineProps} />)}
        <div className="more" onClick={handleMore} role="button" tabIndex={0}>
          {expanded
            ? '▴ thu gọn (' + tot + ' dòng)'
            : '▾ mở rộng — đang ẩn ' + (tot - HEAD_L - TAIL_L) + ' dòng'}
        </div>
      </>
    );
  } else {
    content = n.lines.map((l, i) => <Line key={i} line={l} {...lineProps} />);
  }

  const cls = [
    'node',
    'k-' + n.kind,
    n.ctag ? 'c-' + n.ctag : '',
    n.flags && n.flags.terminal ? 'terminal' : '',
    n.flags && n.flags.tail ? 'tail' : '',
    lit ? 'lit' : '',
    hit ? 'hit' : '',           // khớp văn bản (fallback) — viền cam như bản cũ
    dimmed ? 'dimmed' : '',
    focus ? 'focus' : '',
    focus2 ? 'focus2' : '',
    pinned ? 'pinned' : '',
    mainPath || pl ? 'pl' : '', // 🧭 luồng chính hoặc 📖 hover câu
    noteOpen ? 'note-open' : '',
  ].filter(Boolean).join(' ');

  const badge = noteState === 'ok' ? '✓' : noteState === 'stale' ? '⚠' : noteState === 'orphan' ? '✗' : null;

  // Cổng vào/ra phải theo hướng layout: LR → cạnh vào TRÁI, ra PHẢI (bản cũ
  // có 2 handle mỗi chiều; chỉ TB mà không LR làm graph ngang xấu nét chéo).
  const isLR = data.rankdir === 'LR';
  const tgtPos = isLR ? Position.Left : Position.Top;
  const srcPos = isLR ? Position.Right : Position.Bottom;

  return (
    <>
      <Handle type="target" position={tgtPos} isConnectable={false} />
      <div
        className={cls}
        data-nid={n.id}
        tabIndex={0}
        role="group"
        aria-label={
          'Block ' + blockRef + (isEntryNode(n) ? ' entry' : '') +
          (n.flags && n.flags.terminal ? ' terminal' : '')
        }
      >
        {content}
        <span
          className="tag"
          title={'Block ' + blockRef + ' — số này dùng trong note và 📤 AI data (B1 = block đầu tiên)' +
            (isEntryNode(n) ? ' · đầu hàm' : '')}
        >
          {blockRef}
          {isEntryNode(n) ? <span className="tag-entry"> in</span> : null}
        </span>
        {badge && notesMode !== 'off' ? (
          <span
            className={'noteBadge nb nb-' + noteState + ' ' + noteState}
            role="button"
            tabIndex={0}
            title={'Note ' + (noteRef || '') + ' — ' + NOTE_STATE_LABEL[noteState] + ' (click để xem)'}
            onClick={(ev) => { ev.stopPropagation(); onOpenNote && onOpenNote(n.id); }}
            onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.stopPropagation(); onOpenNote && onOpenNote(n.id); } }}
          >
            {badge}
          </span>
        ) : null}
        {/* ô note đầy đủ (mode full) là NODE riêng type 'notePanel' —
            xem src/notes/cards.js. */}
      </div>
      <Handle type="source" position={srcPos} isConnectable={false} />
    </>
  );
}

export const CfgNode = memo(CfgNodeInner);
export default CfgNode;
