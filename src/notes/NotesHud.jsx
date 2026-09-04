/* =========================================================================
 * PCODE Grapher · src/notes/NotesHud.jsx — HUD góc trái-trên (port notes-hud.js)
 * 📝 · [Tắt|Badge|Đầy đủ] · ✓/⚠/✗ · tên hàm · 📖 · 🗑
 * ========================================================================= */

import { useStore } from '../store/useStore.js';
import { setNotesMode, noteCounts } from './ui.js';
import { IcNote, IcUp, IcDown, IcBook, IcTrash } from '../ui/icons.jsx';

const MODES = [
  ['off', 'Tắt', 'Ẩn toàn bộ note'],
  ['badge', 'Badge', 'Chỉ hiện dấu ✓/⚠/✗ ở góc block — click để đọc'],
  ['full', 'Đầy đủ', 'Hiện ô note cạnh MỖI block (bôi đen / chuột phải đọc TTS được)'],
];

export default function NotesHud({ onModeChange, onToggleProse, onClearNotes }) {
  const notes = useStore((s) => s.notes);
  const notesMode = useStore((s) => s.notesMode);
  const graphData = useStore((s) => s.graphData);
  const proseOpen = useStore((s) => s.ui.proseOpen);
  const toast = useStore((s) => s.toast);

  const hasGraph = !!(graphData && graphData.nodes && graphData.nodes.length);
  if (!hasGraph) return null;

  const cnt = noteCounts(notes);
  const fn = (notes && notes.meta && notes.meta.fn) || '';

  return (
    <div id="notesHud">
      <span className="nh-ico" title="AI notes — chú giải từng block/mũi tên; tool tự giữ đồng bộ với graph"><IcNote /></span>

      <div className="nh-seg">
        {MODES.map(([m, label, tip]) => (
          <button key={m} type="button" className={m === notesMode ? 'on' : ''}
            title={tip + (m === notesMode ? '  (đang bật)' : '')}
            onClick={(ev) => {
              ev.stopPropagation();
              if (!notes && m !== 'off') { toast('Chưa có AI notes — bấm 📥 Notes để nạp'); return; }
              const needRelayout = setNotesMode(m);
              if (needRelayout && onModeChange) onModeChange(m);
            }}>
            {label}
          </button>
        ))}
      </div>

      {!notes ? (
        <span className="nh-hint">
          {'Chưa có note · '}<b><IcUp /> AI data</b>{' → dán cho AI → '}<b><IcDown /> Notes</b>
        </span>
      ) : (
        <>
          {cnt ? (
            <>
              <span className="nh-sep" />
              <span className="nh-cnt">
                <span className={'nh-c ok' + (cnt.ok ? '' : ' zero')}
                  title={cnt.ok + ' note vẫn khớp code (' + cnt.bOk + ' block / ' + cnt.eOk + ' mũi tên)'}>
                  {'✓ ' + cnt.ok}
                </span>
                <span className={'nh-c stale' + (cnt.stale ? '' : ' zero')}
                  title={cnt.stale + ' note có code đã đổi — nên đọc lại'}>
                  {'⚠ ' + cnt.stale}
                </span>
                <span className={'nh-c orphan' + (cnt.orphan ? '' : ' zero')}
                  title={cnt.orphan + ' note không còn block tương ứng (code đã xoá/viết lại)'}>
                  {'✗ ' + cnt.orphan}
                </span>
              </span>
            </>
          ) : null}
          {fn ? (
            <span className="nh-fn" title={'Note này thuộc hàm: ' + fn +
              '\n(đổi sang hàm khác → note tự gỡ; quay lại hàm này là note tự về)'}>
              {fn}
            </span>
          ) : null}
          <button type="button" className={'nh-btn ' + (proseOpen ? 'on' : '')}
            title="Panel luồng logic chữ viết (tóm tắt của AI)"
            onClick={(ev) => { ev.stopPropagation(); onToggleProse && onToggleProse(); }}><IcBook /></button>
          <button type="button" className="nh-btn danger"
            title="Xoá note của HÀM này (note các hàm khác giữ nguyên)"
            onClick={(ev) => { ev.stopPropagation(); onClearNotes && onClearNotes(); }}><IcTrash /></button>
        </>
      )}
    </div>
  );
}
