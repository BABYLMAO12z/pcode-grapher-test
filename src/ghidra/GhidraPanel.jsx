/* =========================================================================
 * PCODE Grapher · src/ghidra/GhidraPanel.jsx — khu GHIDRA LIVE trong side panel
 * Port khối #ghUrl/#ghToken/#ghConnect/#ghDisconnect/#ghSync/#ghFilter/#ghFuncs
 * + #ghStatus/#ghSecurity/#ghHelp của index.html cũ (giữ nguyên id để CSS khớp).
 * ========================================================================= */

import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore.js';
import {
  ghidraConnect, ghidraDisconnect, ghidraSyncToGhidra, ghidraFilterFunctions,
  ghidraOpenFunction,
} from './bridge.js';

export default function GhidraPanel({ rebuild }) {
  const g = useStore((s) => s.ghdr);
  const ui = useStore((s) => s.ui);
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [filter, setFilter] = useState('');

  // URL lần trước (localStorage pcode.ghidra.url) + bootstrap token khi tool
  // được chính bridge phục vụ (Tool Dir mode) — port initGhidra.
  // Thiếu sót của v2 trước: bản cũ `autoBridge` TỰ KẾT NỐI khi có bootstrap
  // token (?token= do bridge in ra), v2 chỉ điền ô mà bắt user bấm Kết nối.
  useEffect(() => {
    let u = g.displayUrl || g.url || ''; // FIX(24): ô nhập hiện URL hiển thị, không phải base fetch
    let boot = '';
    const loc = window.location;
    if ((loc.protocol === 'http:' || loc.protocol === 'https:') &&
        /^(127\.0\.0\.1|localhost|::1)$/i.test(loc.hostname || '')) {
      u = loc.origin;
      boot = new URLSearchParams(loc.search).get('token') || '';
      if (boot) setToken(boot);
    }
    setUrl(u);
    if (boot) {
      const t = setTimeout(() => { ghidraConnect(u, boot); }, 0);
      return () => clearTimeout(t);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const hasProgram = !!g.program;

  return (
    <div id="ghBox">
      <div className="row">
        <span id="ghStatusDot" className={'dot ' + (ui.ghState === true ? 'on' : ui.ghState === false ? 'off' : '')} />
        <input id="ghUrl" value={url} placeholder="http://127.0.0.1:8765"
          onChange={(e) => setUrl(e.target.value)} />
        {g.recent.length > 1 ? (
          <select aria-label="Gần đây" value="" onChange={(e) => { if (e.target.value) setUrl(e.target.value); }}
            style={{ maxWidth: 90, fontSize: 11, height: 27 }}>
            <option value="">Gần đây</option>
            {g.recent.map((u) => <option key={u} value={u}>{u.replace(/^https?:\/\//, '')}</option>)}
          </select>
        ) : null}
      </div>
      <div className="row">
        <input id="ghToken" value={token} placeholder="token (nếu bật Require Token)"
          onChange={(e) => setToken(e.target.value)} />
        <button id="ghConnect" onClick={() => ghidraConnect(url, token)}>Kết nối</button>
        <button id="ghDisconnect" disabled={!g.connected} onClick={() => ghidraDisconnect(true)}>Ngắt</button>
      </div>

      <div id="ghStatus" className={'ghStatus' + (ui.ghState === true ? ' ok' : ui.ghState === false ? ' bad' : '')}>
        {ui.ghStatus || 'offline — paste mã như cũ, hoặc kết nối Ghidra để duyệt hàm & thấy tên symbol live (đổi tên trong Ghidra cập nhật tức thì).'}
      </div>
      {ui.ghSecurity ? (
        <div id="ghSecurity" className={'ghSecurity ' + (ui.ghSecurityState || '')}>{ui.ghSecurity}</div>
      ) : null}
      {ui.ghHelp ? (
        <div id="ghHelp">
          {ui.ghHelp.message}
          {ui.ghHelp.linkUrl ? (
            <> <a href={ui.ghHelp.linkUrl} target="_blank" rel="noopener">{ui.ghHelp.linkLabel || ui.ghHelp.linkUrl}</a></>
          ) : null}
        </div>
      ) : null}

      <div className="row">
        <input id="ghFilter" value={filter} placeholder="lọc hàm…" disabled={!g.connected || !hasProgram}
          onChange={(e) => { setFilter(e.target.value); ghidraFilterFunctions(e.target.value); }} />
        <button id="ghSync" disabled={!g.connected || !hasProgram} onClick={() => ghidraSyncToGhidra()}
          title="Nhảy con trỏ CodeBrowser tới hàm đang xem">Đồng bộ tới Ghidra</button>
      </div>
      <select id="ghFuncs" size={6} disabled={!g.connected || !hasProgram}
        onChange={(e) => ghidraOpenFunction(e.target.value, rebuild)}>
        {!g.connected ? (
          <option disabled>(chưa kết nối)</option>
        ) : !hasProgram ? (
          <option disabled>(mở một program trong CodeBrowser)</option>
        ) : !g.functions.length ? (
          <option disabled>(không có hàm khớp bộ lọc)</option>
        ) : (
          <>
            {g.functions.map((f) => (
              <option key={f.entry} value={f.entry}>{f.name + f.tag + '  —  ' + f.entry}</option>
            ))}
            {g.functionsHasMore ? (
              <option disabled>{'— còn nhiều hàm nữa (đã cắt ở ' + (g.functionsLimit || 500) + '); hãy gõ lọc —'}</option>
            ) : null}
          </>
        )}
      </select>
    </div>
  );
}
