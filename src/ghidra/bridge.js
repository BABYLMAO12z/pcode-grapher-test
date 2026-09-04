/* =========================================================================
 * PCODE Grapher · src/ghidra/bridge.js — GHIDRA LIVE (port js/ui/ghidra.js)
 *
 * Client cho bridge Java chạy cục bộ. Vẽ graph offline VẪN độc lập hoàn toàn:
 * bridge lỗi/ngắt không bao giờ chặn paste → build.
 *
 * Khác bản cũ:
 *  - Không đụng DOM. Trạng thái nằm ở store slice `ghdr` + `liveNames` (D8):
 *    Map(text gốc → tên live) do CfgNode/notes/export đọc, thay cho việc sửa
 *    textContent của từng <span class="tk"> (applySymbolOverlay/clearLiveOverlay).
 *  - Dev server proxy `/api` + `/events` → 127.0.0.1:8765 (D9), nên cùng origin
 *    là đường mặc định, tránh CORS/PNA.
 * Giữ nguyên: parseBridgeUrl, session guard, heartbeat 30s + zombie 40s,
 * dirtyGap resync theo /api/resolve (chunk 60, tối đa 480), LRU URL gần đây.
 * ========================================================================= */

import { useStore } from '../store/useStore.js';
import { syncNotesToGraph } from '../notes/index.js';

export const FETCH_TIMEOUT_MS = 35000;
export const HEARTBEAT_MS = 30000;
export const ZOMBIE_MS = 40000;
export const RESOLVE_CHUNK = 60;
export const RESOLVE_MAX = 480;
/** D11: `pcode.ghidra.recent` cap 8 (bản cũ cắt 5; hợp đồng D11 chốt 8 → dùng
 *  action saveRecentUrl của store để KHÔNG có hai chỗ cắt khác nhau). */
export const RECENT_MAX = 8;

/** Trạng thái không tuần tự hoá được (EventSource, timer) — ngoài store. */
/* FIX(6): hai luồng debounce ĐỘC LẬP — trước đây dùng chung `live.debounce`
 * nên gõ vào ô lọc hàm sẽ huỷ lần re-decompile đang chờ (và ngược lại). */
const live = { evts: null, hb: null, debounceFn: null, debounceFilter: null, flashTimer: null, renameTimer: null };

/* B2: rename trong Ghidra đổi TÊN HIỂN THỊ → width node phải đo lại → cần
 * rebuild (App đăng ký doBuild). Debounce vì SSE có thể đẩy nhiều event sát nhau.
 * U11: hàm này cũng là rebuild dự phòng cho SSE (ghidraConnect gọi
 * ghidraStartEvents(session) không có ctx — trước đây syncFunction SSE nạp code
 * vào editor nhưng KHÔNG rebuild graph). */
let rebuildOnRename = null;
export function setRebuildOnRename(fn) { rebuildOnRename = fn; }
function sseRebuild(keepView) {
  const fn = rebuildOnRename;
  if (!fn) return false;
  try { fn(!!keepView); return true; } catch { /* nt */ return false; }
}
function scheduleRenameRebuild() {
  if (!rebuildOnRename || !S().graphData) return;
  clearTimeout(live.renameTimer);
  live.renameTimer = setTimeout(() => sseRebuild(true), 250);
}

/* U9: rename địa chỉ KHÔNG có trong map symbol (biến cục bộ/tham số —
 * plugin 1.8.0 chỉ map tên hàm/biến toàn-cục vào symByText) → đón bằng cách
 * re-decompile hàm đang xem (giữ view) — pseudocode mới mang tên mới.
 * Debounce riêng: SSE batch rename chỉ decompile 1 lần. */
function scheduleFunctionRefresh() {
  const g = ghdr();
  if (!g.connected || !g.currentAddress) return;
  clearTimeout(live.debounceFn);
  live.debounceFn = setTimeout(() => {
    const g2 = ghdr();
    if (!g2.connected || !g2.currentAddress) return;
    ghidraOpenFunction(g2.currentAddress, (keepView) => sseRebuild(keepView), { keepView: true });
  }, 400);
}

const S = () => useStore.getState();
const ghdr = () => S().ghdr;
const patchGhdr = (patch) => useStore.setState({ ghdr: { ...ghdr(), ...patch } });

/* ------------------------------ URL ------------------------------------- */

/**
 * Chấp nhận base URL trần hoặc URL đầy đủ Ghidra in ra (…/?token=abc):
 * token trong query được tách ra để /api/* và EventSource dùng đúng.
 * PORT NGUYÊN VĂN parseBridgeUrl.
 */
export function parseBridgeUrl(raw, loc = typeof window !== 'undefined' ? window.location : null) {
  const value = (raw || '').trim();
  if (!value) return { base: '', display: '', token: '' };
  let parsed;
  try {
    parsed = new URL(value, loc ? loc.href : undefined);
  } catch {
    throw new Error('URL bridge không hợp lệ');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Bridge phải dùng http:// hoặc https://');
  }
  const pastedToken = parsed.searchParams.get('token') || '';
  if (parsed.pathname && parsed.pathname !== '/') {
    throw new Error('URL bridge chỉ được chứa host:port (không có đường dẫn)');
  }
  // Ghidra bind IPv4 loopback; Windows có thể phân giải localhost thành ::1 trước.
  if (parsed.hostname.toLowerCase() === 'localhost') parsed.hostname = '127.0.0.1';
  const origin = parsed.origin;
  const sameOrigin = !!loc && loc.protocol !== 'file:' && loc.origin === origin;
  return { base: sameOrigin ? '' : origin, display: origin, token: pastedToken };
}

export function bridgeUrl(path) {
  const g = ghdr();
  const base = g.url || '';
  const sep = path.indexOf('?') >= 0 ? '&' : '?';
  return base + path + sep + 'token=' + encodeURIComponent(g.token || '');
}

/** fetch có timeout 35s, ném Error với message của bridge (port ghidraFetch). */
export async function ghidraFetch(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const g = ghdr();
  try {
    const response = await fetch(bridgeUrl(path), {
      cache: 'no-store',
      signal: controller.signal,
      headers: g.token ? { 'X-Bridge-Token': g.token } : {},
    });
    let body = null;
    try { body = await response.json(); } catch { /* proxy trả text */ }
    if (!response.ok) throw new Error((body && body.error) || 'HTTP ' + response.status);
    if (body && body.error) throw new Error(body.error);
    return body || {};
  } finally {
    clearTimeout(timer);
  }
}

/* ---------------------------- trạng thái UI ------------------------------ */

export function ghidraStatus(message, state) {
  useStore.getState().setUi({
    ghStatus: message,
    ghState: state,
    netStatus: state === true ? 'Ghidra Live · đã kết nối'
      : state === false ? 'Ghidra Live · lỗi kết nối'
      : ghdr().connected ? 'Ghidra Live · đang kết nối…' : 'offline · không cần cài đặt',
  });
}

export function ghidraSecurity(message, state) {
  useStore.getState().setUi({ ghSecurity: message || '', ghSecurityState: state || '' });
}

export function ghidraHelp(message, linkUrl, linkLabel) {
  useStore.getState().setUi({ ghHelp: message ? { message, linkUrl, linkLabel } : null });
}

/** Thông điệp khi fetch chết — port failedFetchHelp. */
export function failedFetchHelp(error, bridge, loc = typeof window !== 'undefined' ? window.location : null) {
  const detail = (error && error.message) || 'Failed to fetch';
  const localPage = !loc || loc.protocol === 'file:' ||
    /^(localhost|127\.0\.0\.1|\[::1\])$/i.test((loc && loc.hostname) || '');
  const prefix = localPage
    ? 'Trình duyệt không tới được bridge. Kiểm tra URL/port bằng /api/health; nếu trang mở từ file:// vẫn lỗi, hãy đặt Tool Dir trong Ghidra rồi mở tool qua bridge.'
    : 'Trang web này đang chạy trong preview/host khác, nên 127.0.0.1 không phải máy đang chạy Ghidra. Hãy tải và mở index.html trên chính Windows, hoặc đặt Tool Dir trong Ghidra rồi mở tool qua bridge.';
  ghidraHelp(prefix + ' (' + detail + ')', bridge ? bridge + '/api/health' : '', 'Kiểm tra bridge');
  return prefix;
}

/* ------------------------------ symbol ---------------------------------- */

/** symByText → Map(text → tên live) cho D8. DEFAULT / tên trùng thì bỏ. */
export function liveNamesFrom(symByText) {
  const m = new Map();
  for (const text in symByText || {}) {
    const info = symByText[text];
    if (info && info.name && info.source !== 'DEFAULT' && info.name !== text) m.set(text, info.name);
  }
  return m;
}

/** Cập nhật liveNames trong store → CfgNode đổi CHỮ HIỂN THỊ, giữ data-key gốc. */
function pushLiveNames() {
  const names = liveNamesFrom(ghdr().symByText);
  const prev = useStore.getState().liveNames;
  let changed = !prev || prev.size !== names.size;
  if (!changed) for (const [k, v] of names) if (prev.get(k) !== v) { changed = true; break; }
  // Nội dung giống hệt (vd setLiveSymbols gọi 2 lần, resolve trả dữ liệu cũ) →
  // không đụng store: tránh map lại toàn bộ rfNodes (= re-render mọi block/edge
  // vô ích) và giữ nguyên identity của Map cho subscriber (RichText cache ctx).
  if (!changed) return prev;
  useStore.setState({ liveNames: names });
  // node đã dựng rồi → bơm Map mới vào data để React re-render (không rebuild)
  const s = useStore.getState();
  useStore.setState({
    rfNodes: s.rfNodes.map((n) => (n.type === 'cfg' ? { ...n, data: { ...n.data, liveNames: names } } : n)),
  });
  // B2: tên hiển thị đổi → width node đổi → đo + layout lại (debounce)
  if (changed) scheduleRenameRebuild();
  return names;
}

export function setLiveSymbols(symbols) {
  const symByText = symbols || {};
  const addrToTexts = {};
  for (const text in symByText) {
    const info = symByText[text];
    if (info && info.addr) (addrToTexts[info.addr] = addrToTexts[info.addr] || []).push(text);
  }
  patchGhdr({ symByText, addrToTexts });
  return pushLiveNames();
}

export function resetLiveSymbols() {
  patchGhdr({ symByText: {}, addrToTexts: {} });
  return pushLiveNames();
}

/** Nháy sáng token tại địa chỉ (port flashAddress) — qua store, không selector. */
export function flashAddress(address, ms = 800) {
  useStore.getState().setUi({ flashAddr: address });
  clearTimeout(live.flashTimer);
  live.flashTimer = setTimeout(() => {
    if (useStore.getState().ui.flashAddr === address) useStore.getState().setUi({ flashAddr: null });
  }, ms);
}

/** Rename tại 1 địa chỉ: cập nhật symbol + liveNames + đồng bộ note NGAY. */
export function updateSymbolsAtAddress(address, patch) {
  const g = ghdr();
  const texts = g.addrToTexts[address] || [];
  if (!texts.length) return 0;
  const symByText = { ...g.symByText };
  texts.forEach((text) => {
    if (!symByText[text]) return;
    symByText[text] = { ...symByText[text], ...(patch || {}) };
  });
  patchGhdr({ symByText });
  pushLiveNames();
  // Note AI viết bằng TÊN CŨ → đồng bộ ngay, lỗi notes không phá luồng rename.
  try { syncNotesToGraph(); } catch { /* nt */ }
  flashAddress(address);
  return texts.length;
}

export function refreshSymbolsAtAddress(address) {
  if (!address || !ghdr().connected) return Promise.resolve(null);
  const session = ghdr().session;
  return ghidraFetch('/api/resolve?addresses=' + encodeURIComponent(address))
    .then((resolved) => {
      if (session !== ghdr().session) return null;
      const info = resolved[address];
      updateSymbolsAtAddress(address, info || { name: null, source: 'DEFAULT' });
      return info || null;
    })
    .catch(() => null); // lỗi tạm thời không được giết EventSource
}

/* ---------------------------- kết nối ----------------------------------- */

export function closeEventSource() {
  if (live.evts) {
    try { live.evts.close(); } catch { /* đã đóng */ }
    live.evts = null;
  }
}

export function ghidraDisconnect(showStatus) {
  const g = ghdr();
  useStore.setState({ ghdr: { ...g, session: g.session + 1 } });
  clearTimeout(live.debounceFn);
  clearTimeout(live.debounceFilter);
  if (live.hb) { clearInterval(live.hb); live.hb = null; }
  closeEventSource();
  patchGhdr({ connected: false, program: null, currentAddress: null, url: '', displayUrl: '', functions: [] });
  resetLiveSymbols();
  if (showStatus !== false) {
    ghidraStatus('offline — paste mã như cũ, hoặc kết nối Ghidra.', null);
    ghidraHelp('');
  }
  ghidraSecurity('');
  return true;
}

export function saveRecentUrl(url) {
  return useStore.getState().saveRecentUrl(url);
}

/** Kết nối bridge (port ghidraConnect). @returns Promise<boolean> */
export async function ghidraConnect(rawUrl, rawToken) {
  let parsed;
  try {
    parsed = parseBridgeUrl(rawUrl);
  } catch (err) {
    ghidraStatus('Không kết nối được: ' + err.message, false);
    return false;
  }
  const token = String(rawToken || parsed.token || '').trim();
  closeEventSource();
  const session = ghdr().session + 1;
  patchGhdr({ url: parsed.base, displayUrl: parsed.display, token, session });
  ghidraHelp('');
  ghidraStatus('Đang kết nối ' + parsed.display + ' …', null);

  try {
    const health = await ghidraFetch('/api/health');
    if (session !== ghdr().session) return false;
    const hasProgram = health.ok !== false && !!health.program;
    patchGhdr({ connected: true, program: health.program || null });
    ghidraSecurity(
      health.needsToken
        ? '🔐 Bridge yêu cầu token — token trong ô hiện tại đã được xác thực.'
        : '🔓 Bridge báo needsToken=false: Require Token đang tắt, nên Console sẽ không in token. Trong Ghidra chọn Tools → PCODE Grapher Bridge → Generate token and restart để bật token.',
      health.needsToken ? 'on' : 'off'
    );
    useStore.getState().rememberGhidraUrl(parsed.display); // FIX(5): giữ nguyên base fetch
    saveRecentUrl(parsed.display);
    if (health.servesTool && health.toolUrl &&
        typeof window !== 'undefined' && window.location.origin !== parsed.display) {
      ghidraHelp('Bridge đang phục vụ tool cùng origin; mở bản này để tránh CORS/Private Network Access.',
        health.toolUrl, 'Mở tool qua bridge');
    }
    if (!hasProgram) {
      ghidraStatus('🟡 Đã kết nối bridge ' + (health.version ? 'v' + health.version + ' · ' : '') +
        'chưa có program active trong CodeBrowser.', null);
    } else {
      ghidraStatus('🟢 Đã kết nối · ' + health.program + ' · ' + (health.language || '') +
        (health.needsToken ? ' · token OK' : ''), true);
      await ghidraLoadFunctions('', session);
    }
    ghidraStartEvents(session);
    return true;
  } catch (err) {
    if (session !== ghdr().session) return false;
    const bridge = parsed.display;
    ghidraDisconnect(false);
    ghidraStatus('Không kết nối được: ' + err.message, false);
    if (/401|missing\/invalid token/i.test(err.message || '')) {
      ghidraSecurity('🔐 Bridge đang yêu cầu token nhưng token trống hoặc không khớp. Dán nguyên URL Console in ra sau khi bật Require Token.', 'bad');
    }
    if (/failed to fetch|networkerror|load failed/i.test(err.message || '')) failedFetchHelp(err, bridge);
    return false;
  }
}

/** Danh sách hàm (port ghidraLoadFunctions) — lưu vào store thay vì <option>. */
export async function ghidraLoadFunctions(query, session) {
  const requestSession = session || ghdr().session;
  if (!ghdr().connected) return null;
  try {
    const data = await ghidraFetch('/api/functions?q=' + encodeURIComponent(query || '') + '&limit=500');
    if (requestSession !== ghdr().session || !ghdr().connected) return null;
    const items = Array.isArray(data.items) ? data.items : [];
    patchGhdr({
      functions: items.map((it) => ({
        entry: it.entry || '',
        name: it.name || '(unnamed)',
        tag: it.isExternal ? ' [ext]' : it.isThunk ? ' [thunk]' : '',
      })),
      functionsHasMore: !!data.hasMore,
      functionsLimit: data.limit || 500,
    });
    return items;
  } catch (err) {
    if (requestSession === ghdr().session) ghidraStatus('Lỗi tải danh sách hàm: ' + err.message, false);
    return null;
  }
}

/** Lọc hàm có nén 250ms (port listener #ghFilter). */
export function ghidraFilterFunctions(query) {
  clearTimeout(live.debounceFilter);
  const g = ghdr();
  if (!g.connected || !g.program) return;
  live.debounceFilter = setTimeout(() => ghidraLoadFunctions(query), 250);
}

/**
 * Decompile + nạp vào editor + build lại (port ghidraOpenFunction).
 * @param {function} rebuild build(false) của app — bơm vào để module không phụ
 *   thuộc vòng graph→ghidra.
 */
export async function ghidraOpenFunction(address, rebuild, opts = {}) {
  if (!address || !ghdr().connected) return null;
  patchGhdr({ currentAddress: address }); // nhớ entry cho nút "Đồng bộ tới Ghidra"
  const session = ghdr().session;
  ghidraStatus('Đang decompile ' + address + ' …', null);
  try {
    const data = await ghidraFetch('/api/decompile?address=' + encodeURIComponent(address));
    if (session !== ghdr().session || !ghdr().connected) return null;
    // symbol PHẢI set TRƯỚC khi render (build không phát sự kiện input)
    setLiveSymbols(data.symbols || {});
    useStore.getState().setSrc(data.pseudocode || '');
    // U9 keepView: refresh hàm ĐANG XEM (rename biến cục bộ) — giữ sắp xếp tay
    // + zoom/pan của user; hàm KHÁC (syncFunction/panel) → layout lại sạch.
    if (!opts.keepView) useStore.setState({ manualPos: {} });
    if (rebuild) await rebuild(!!opts.keepView);
    pushLiveNames();
    const count = Object.keys(ghdr().symByText).length;
    const warning = data.timedOut ? ' · decompile timeout' : '';
    ghidraStatus('Đã nạp ' + (data.signature || address) + ' · ' + count + ' symbol live' + warning, !data.timedOut);
    return data;
  } catch (err) {
    if (session === ghdr().session) ghidraStatus('Lỗi decompile: ' + err.message, false);
    return null;
  }
}

/** Tool → Ghidra: nhảy con trỏ CodeBrowser tới hàm đang xem (/api/goto). */
export async function ghidraSyncToGhidra() {
  const toast = useStore.getState().toast;
  const g = ghdr();
  if (!g.connected) { toast('Chưa kết nối bridge Ghidra.'); return false; }
  if (!g.currentAddress) { toast('Chưa có hàm nào đang mở để đồng bộ tới Ghidra.'); return false; }
  try {
    const r = await ghidraFetch('/api/goto?address=' + encodeURIComponent(g.currentAddress));
    if (r && r.ok) { toast('Đồng bộ tới Ghidra: ' + (r.address || g.currentAddress)); return true; }
    toast('Ghidra không nhảy tới hàm (' + ((r && r.error) || 'goto failed') + ')');
    return false;
  } catch (err) {
    toast('Lỗi đồng bộ tới Ghidra: ' + err.message);
    return false;
  }
}

/* ------------------------------ SSE ------------------------------------- */

/** Xử lý 1 event SSE (port ghidraHandleEvent). */
export function ghidraHandleEvent(message, ctx = {}) {
  const toast = useStore.getState().toast;
  let event;
  try { event = JSON.parse(message.data); } catch { return null; }

  if (event.type === 'symbolRenamed' && event.address) {
    const touched = updateSymbolsAtAddress(event.address, {
      name: event.newName || null,
      source: event.source || 'USER_DEFINED',
    });
    toast('Ghidra rename → ' + (event.newName || '(đã xoá)'));
    // U9: địa chỉ không có trong map symbol (biến cục bộ/tham số) → re-decompile
    // hàm đang xem cho tên mới hiện ra NGAY (trước đây phải F5).
    if (!touched) scheduleFunctionRefresh();
    return event.type;
  }
  if (event.type === 'symbolChanged' && event.address) {
    if (Object.prototype.hasOwnProperty.call(event, 'name')) {
      const touched = updateSymbolsAtAddress(event.address, { name: event.name, source: event.source || 'DEFAULT' });
      if (!touched) scheduleFunctionRefresh();
    } else {
      refreshSymbolsAtAddress(event.address);
    }
    return event.type;
  }
  // Ghidra → Tool: chuột phải "Đồng bộ hàm tới PCODE Grapher" (Ctrl+Shift+G)
  if (event.type === 'syncFunction' && event.address) {
    if (!ghdr().connected) return event.type;
    // U11: ghidraConnect mở EventSource KHÔNG có ctx.rebuild — dùng rebuild
    // App đăng ký (setRebuildOnRename) để graph thật sự dựng hàm mới.
    ghidraOpenFunction(event.address, ctx.rebuild || ((keepView) => sseRebuild(keepView)));
    toast('Ghidra đồng bộ → ' + (event.name || event.address));
    return event.type;
  }
  if (event.type === 'programActivated') {
    patchGhdr({ program: event.program || null });
    resetLiveSymbols();
    if (event.program) {
      ghidraStatus('🟢 Ghidra chuyển sang program · ' + event.program, true);
      ghidraLoadFunctions('');
    }
    return event.type;
  }
  if (event.type === 'programDeactivated') {
    patchGhdr({ program: null, functions: [] });
    resetLiveSymbols();
    ghidraStatus('🟡 Bridge còn kết nối nhưng program Ghidra đã đóng.', null);
    return event.type;
  }
  return null;
}

/** Lấy lại tên symbol sau khi SSE nối lại (port ghidraResyncSymbols). */
export function ghidraResyncSymbols(session) {
  const addrs = Object.keys(ghdr().addrToTexts || {});
  if (!addrs.length || !ghdr().connected) return 0;
  let batches = 0;
  for (let i = 0; i < Math.min(addrs.length, RESOLVE_MAX); i += RESOLVE_CHUNK) {
    const part = addrs.slice(i, i + RESOLVE_CHUNK);
    batches++;
    ghidraFetch('/api/resolve?addresses=' + encodeURIComponent(part.join(',')))
      .then((resolved) => {
        if (session !== ghdr().session || !ghdr().connected) return;
        for (const addr of part) {
          const info = resolved && resolved[addr];
          if (info) updateSymbolsAtAddress(addr, info);
        }
      })
      .catch(() => { /* bridge chết — heartbeat lo báo lỗi */ });
  }
  return batches;
}

/** Mở EventSource + heartbeat (port ghidraStartEvents, giữ 2 bản vá leak). */
export function ghidraStartEvents(session, ctx = {}) {
  closeEventSource();
  // PHẢI clear _hb CŨ trước khi tạo cái mới, nếu không heartbeat nhân đôi mỗi
  // chu kỳ khi server chết đột ngột (leak hàng trăm nghìn interval — bug bản cũ).
  if (live.hb) { clearInterval(live.hb); live.hb = null; }
  if (typeof EventSource === 'undefined') {
    ghidraStatus('🟡 Đã kết nối (trình duyệt không có EventSource; rename cập nhật khi mở lại hàm)', true);
    return null;
  }
  const es = new EventSource(bridgeUrl('/events'));
  live.evts = es;
  // Server ping 15s/lần → im lặng >40s là stream zombie (onerror chỉ bắt CLOSED).
  let lastByte = Date.now();
  let dirtyGap = false;

  es.onopen = () => {
    lastByte = Date.now();
    if (!dirtyGap) return;
    dirtyGap = false;
    ghidraResyncSymbols(session); // event rename lúc đứt đã mất, server không replay
  };
  es.onmessage = (message) => {
    lastByte = Date.now();
    if (session === ghdr().session) ghidraHandleEvent(message, ctx);
  };
  es.onerror = () => {
    if (session !== ghdr().session) return;
    dirtyGap = true;
    if (es.readyState === EventSource.CLOSED) {
      setTimeout(() => {
        if (session === ghdr().session && ghdr().connected) ghidraStartEvents(session, ctx);
      }, 2000);
    }
    // CONNECTING: trình duyệt tự retry, chỉ đánh dấu dirtyGap để resync.
  };

  // heartbeat: lưu handle vào biến CỤC BỘ rồi mới gán live.hb; nhánh session cũ
  // phải clearInterval(CHÍNH NÓ) — bản cũ clear nhầm cái mới nên cái cũ chạy hoài.
  const hb = setInterval(() => {
    if (session !== ghdr().session) { clearInterval(hb); if (live.hb === hb) live.hb = null; return; }
    if (Date.now() - lastByte > ZOMBIE_MS) {
      dirtyGap = true;
      lastByte = Date.now();
      closeEventSource();
      ghidraStartEvents(session, ctx);
      return;
    }
    fetch(bridgeUrl('/api/health'), { cache: 'no-store' })
      .then((r) => {
        if (!r.ok && session === ghdr().session) ghidraStatus('🟡 Bridge không phản hồi — có thể đã dừng.', false);
      })
      .catch(() => {
        if (session === ghdr().session) ghidraStatus('🔴 Mất kết nối bridge.', false);
      });
  }, HEARTBEAT_MS);
  live.hb = hb;
  return es;
}

/** Sửa tay trong editor = thuộc luồng offline → gỡ neo symbol cũ. */
export function onSourceEdited() {
  if (Object.keys(ghdr().symByText).length) resetLiveSymbols();
}

/** Dọn sạch (unmount / test). */
export function _teardown() {
  closeEventSource();
  if (live.hb) { clearInterval(live.hb); live.hb = null; }
  clearTimeout(live.debounceFn);
  clearTimeout(live.debounceFilter);
  clearTimeout(live.flashTimer);
  clearTimeout(live.renameTimer);
}

export const _live = live;
