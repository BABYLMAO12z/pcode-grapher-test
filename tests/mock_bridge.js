/* =========================================================================
 * MOCK BRIDGE — mô phỏng cầu Ghidra theo cùng contract, để phát triển/test
 * tool-side KHÔNG cần Ghidra thật. (Chỉ dành cho dev/test.)
 *
 * Chạy:  node tests/mock_bridge.js            (port 8765)
 *        PORT=9000 node tests/mock_bridge.js
 *
 * Mô phỏng: /api/health, /api/functions, /api/decompile (pseudocode + symbols),
 *           /api/resolve, /api/goto (tool -> ghidra), /events (SSE), và các endpoint
 *           /api/test/* (chỉ mock) để kích hoạt sự kiện rename / syncFunction realtime khi test.
 *
 * Lưu ý: contract này phải khớp 1:1 với ghidra/PcodeGrapherBridge.py.
 * ========================================================================= */
'use strict';
const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT || '8765', 10);
const HOST = '127.0.0.1';
// Optional token mode mirrors the Ghidra plugin and is used by browser integration tests.
const TOKEN = process.env.BRIDGE_TOKEN || '';
// Optional static hosting mirrors the Ghidra Tool Dir mode.
const TOOL_DIR = process.env.TOOL_DIR ? path.resolve(process.env.TOOL_DIR) : '';

// --- chương trình giả lập -------------------------------------------------
const PROGRAM = 'sample.exe';
let PSEUDO = `void __thiscall FUN_14000ecd0(longlong param_1)
{
  int iVar;
  undefined8 uVar;
  iVar = 0;
  DAT_140045720 = 0;
  if (param_1 == 0) {
    FUN_14004cca0(param_1);
  }
  else {
    iVar = 0;
    while (iVar < 10) {
      if ((iVar & 1) == 0) {
        FUN_140059bf0(iVar);
      }
      else {
        FUN_140069a10();
        break;
      }
      iVar = iVar + 1;
    }
  }
  goto LAB_14005abc;
LAB_14005abc:
  return;
}`;

// symbols: tokenText (y như xuất hiện trong pseudocode) -> {addr,name,source,kind,type}
let SYMBOLS = {
  DAT_140045720:  { addr: '0x140045720', name: 'fefa',        source: 'USER_DEFINED', kind: 'data',     type: 'undefined4' },
  FUN_14004cca0:  { addr: '0x14004cca0', name: 'init_check',  source: 'USER_DEFINED', kind: 'function', type: 'void(longlong)' },
  FUN_140059bf0:  { addr: '0x140059bf0', name: 'FUN_140059bf0', source: 'DEFAULT',    kind: 'function', type: 'void(int)' },
  FUN_140069a10:  { addr: '0x140069a10', name: 'FUN_140069a10', source: 'DEFAULT',    kind: 'function', type: 'void(void)' },
  LAB_14005abc:   { addr: '0x14005abc',  name: 'LAB_14005abc',  source: 'DEFAULT',    kind: 'label',    type: null }
};
const FUNCS = [
  { name: 'FUN_14000ecd0', entry: '0x14000ecd0', size: 412, isExternal: false, isThunk: false, signature: 'void __thiscall FUN_14000ecd0(longlong param_1)' },
  { name: 'init_check',     entry: '0x14004cca0', size: 96,  isExternal: false, isThunk: false, signature: 'void init_check(longlong)' },
  { name: 'FUN_140059bf0',  entry: '0x140059bf0', size: 64,  isExternal: false, isThunk: false, signature: 'void FUN_140059bf0(int)' },
  { name: 'entry',          entry: '0x140001000', size: 38,  isExternal: false, isThunk: true,  signature: 'void entry(void)' },
  { name: 'extern_printf',  entry: '0x180001000', size: 0,   isExternal: true,  isThunk: false, signature: 'int printf(char *,...)' }
];

// --- SSE clients ----------------------------------------------------------
const sseClients = new Set();
function broadcast(obj) {
  const line = 'data: ' + JSON.stringify(obj) + '\n\n';
  for (const res of sseClients) { try { res.write(line); } catch (e) {} }
}

// --- last tool->ghidra goto (for tests to assert /api/goto was called) -----
let lastGoto = null;

// --- JSON helper ----------------------------------------------------------
function jres(res, code, obj) {
  const body = Buffer.from(JSON.stringify(obj));
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store'
  };
  res.writeHead(code, headers);
  res.end(body);
}

function hostOK(req) {
  const h = (req.headers.host || '').toLowerCase();
  return h.startsWith('127.0.0.1') || h.startsWith('localhost') || h.startsWith('[');
}

// --- routing --------------------------------------------------------------
const server = http.createServer((req, res) => {
  if (!hostOK(req)) { res.writeHead(403); return res.end('forbidden host'); }
  const parsed = url.parse(req.url, true);
  const p = parsed.pathname;
  const q = parsed.query;

  if (req.method === 'OPTIONS') {           // CORS preflight
    const hdrs = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Bridge-Token'
    };
    // Private Network Access (Chrome 130+/Edge 143+ chặn preflight nếu thiếu):
    // cùng hành vi với plugin Java để integration test phản ánh đúng thực tế.
    if (String(req.headers['access-control-request-private-network'] || '') === 'true') {
      hdrs['Access-Control-Allow-Private-Network'] = 'true';
    }
    res.writeHead(204, hdrs);
    return res.end();
  }
  // Like the Java plugin: JavaScript/CSS can load from Tool Dir without a query
  // token, while every API/SSE request remains protected.
  const protectedRoute = p.startsWith('/api/') || p === '/events';
  if (protectedRoute && TOKEN && q.token !== TOKEN && req.headers['x-bridge-token'] !== TOKEN) {
    return jres(res, 401, { error: 'missing/invalid token' });
  }

  if (p === '/api/health') {
    return jres(res, 200, {
      ok: true, program: PROGRAM, language: 'x86:LE:64:default', addrSize: 64,
      needsToken: !!TOKEN, server: 'mock', version: '1.8.0', apiVersion: 1,
      servesTool: !!TOOL_DIR,
      toolUrl: TOOL_DIR ? ('http://' + HOST + ':' + PORT + '/' + (TOKEN ? '?token=' + encodeURIComponent(TOKEN) : '')) : null
    });
  }
  if (p === '/api/functions') {
    const qq = (q.q || '').toLowerCase();
    const matched = FUNCS.filter(f => !qq || f.name.toLowerCase().includes(qq));
    const off = parseInt(q.offset || '0', 10), lim = parseInt(q.limit || '200', 10);
    const items = matched.slice(off, off + lim);
    // `total` phải cùng nghĩa với plugin Java: số item THỰC SỰ trả về (Java dừng ở
    // limit nên không biết tổng số hàm khớp). Tổng thật để mock riêng ở `matched`,
    // và `hasMore` là cách client báo "danh sách bị cắt".
    return jres(res, 200, {
      items, total: items.length, returned: items.length, offset: off, limit: lim,
      matched: matched.length, hasMore: off + items.length < matched.length
    });
  }
  if (p === '/api/decompile') {
    const addr = q.address || '';
    const f = FUNCS.find(x => x.entry === addr || x.name === (q.name || '\0'));
    if (!f) return jres(res, 404, { error: 'function not found' });
    return jres(res, 200, {
      address: f.entry, signature: f.signature,
      pseudocode: f.entry === '0x14000ecd0' ? PSEUDO : ('// ' + f.signature + '\n{ /* body not mocked */ }'),
      symbols: f.entry === '0x14000ecd0' ? SYMBOLS : {},
      timedOut: false, warnings: [], decompileMs: 12
    });
  }
  if (p === '/api/resolve') {
    const out = {};
    String(q.addresses || '').split(',').filter(Boolean).forEach(a => {
      const hit = Object.values(SYMBOLS).find(s => s.addr === a);
      out[a] = hit ? { name: hit.name, source: hit.source, kind: hit.kind, type: hit.type || null } : { name: null };
    });
    return jres(res, 200, out);
  }
  if (p === '/events') {                     // SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write('event: hello\ndata: {"server":"mock"}\n\n');
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }
  if (p === '/api/test/rename') {            // MOCK-ONLY: mô phỏng rename trong Ghidra
    const a = q.address, newName = q.name;
    if (q.local) {
      // U9: giả lập rename BIẾN CỤC BỘ — địa chỉ stack KHÔNG có trong SYMBOLS
      // (plugin 1.8.0 không map local var) + pseudocode đổi tên theo.
      PSEUDO = PSEUDO.replace(/\biVar\b/g, newName);
      broadcast({ type: 'symbolRenamed', address: a, oldName: 'iVar', newName, source: 'USER_DEFINED', ts: Date.now() });
      return jres(res, 200, { ok: true, local: true });
    }
    const entry = Object.entries(SYMBOLS).find(([t, s]) => s.addr === a);
    if (!entry) return jres(res, 404, { error: 'addr not found' });
    const [text, s] = entry;
    const oldName = s.name;
    s.name = newName; s.source = 'USER_DEFINED';
    broadcast({ type: 'symbolRenamed', address: a, oldName, newName, source: 'USER_DEFINED', ts: Date.now() });
    return jres(res, 200, { ok: true });
  }
  if (p === '/api/goto') {                   // tool -> ghidra navigation
    const a = q.address || '';
    if (!a) return jres(res, 400, { error: "missing 'address'" });
    lastGoto = a;
    return jres(res, 200, { ok: true, address: a });
  }
  if (p === '/api/test/sync') {              // MOCK-ONLY: phát `syncFunction` như popup Ghidra
    const a = q.address || '', name = q.name || '';
    if (!a) return jres(res, 400, { error: "missing 'address'" });
    broadcast({ type: 'syncFunction', address: a, name, program: PROGRAM, ts: Date.now() });
    return jres(res, 200, { ok: true });
  }
  if (p === '/api/test/last-goto') {         // MOCK-ONLY: đọc đích điều hướng cuối
    return jres(res, 200, { address: lastGoto });
  }
  if (TOOL_DIR) {
    const relative = p === '/' ? 'index.html' : p.replace(/^\/+/, '');
    const file = path.resolve(TOOL_DIR, relative);
    if (file.startsWith(TOOL_DIR + path.sep) || file === path.join(TOOL_DIR, 'index.html')) {
      try {
        const body = fs.readFileSync(file);
        const ext = path.extname(file).toLowerCase();
        const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
          '.css': 'text/css; charset=utf-8', '.png': 'image/png' }[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': mime, 'Content-Length': body.length, 'Access-Control-Allow-Origin': '*' });
        return res.end(body);
      } catch (err) { /* serve normal 404 below */ }
    }
  }
  res.writeHead(404); res.end('not found');
});

server.listen(PORT, HOST, () => {
  console.log('MOCK pcode-grapher bridge on http://' + HOST + ':' + PORT);
  console.log('  health:    GET /api/health');
  console.log('  functions: GET /api/functions?q=');
  console.log('  decompile: GET /api/decompile?address=0x14000ecd0');
  console.log('  resolve:   GET /api/resolve?addresses=0x140045720,0x14004cca0');
  console.log('  goto:      GET /api/goto?address=0x14004cca0  (tool -> ghidra, mock records lastGoto)');
  console.log('  events:    GET /events  (SSE)');
  console.log('  rename:    GET /api/test/rename?address=0x140045720&name=NEW_NAME  (mock-only, phát SSE)');
  console.log('  sync:      GET /api/test/sync?address=0x14004cca0&name=init_check  (mock-only, phát syncFunction SSE)');
  console.log('  last-goto: GET /api/test/last-goto  (mock-only, đọc lastGoto)');
});
