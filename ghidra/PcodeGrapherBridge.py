# =========================================================================
#  PCODE Grapher — Ghidra HTTP Bridge  (Jython GhidraScript)
# =========================================================================
#  Mở cầu HTTP trong chính JVM Ghidra để trình duyệt (PCODE Grapher) lấy
#  decompile + symbol LIVE, và nhận rename realtime qua SSE.
#
#  Cài đặt / chạy:
#    1. Copy file này vào <Ghidra>/Ghidra/Features/Base/ghidra_scripts/  (hoặc
#       thư mục script cá nhân: Window → File Repository... / Script Manager).
#    2. Trong Ghidra: mở program cần phân tích → CodeBrowser.
#    3. Script Manager → tìm "PcodeGrapherBridge" → Run.
#    4. Console in ra:  http://127.0.0.1:8765/?token=XXXX   → mở link đó.
#
#  Bảo mật: chỉ bind 127.0.0.1; kiểm tra header Host (chống DNS rebinding);
#  token BẮT BUỘC mặc định (REQUIRE_TOKEN=False chỉ khi bạn hiểu rõ rủi ro:
#  bridge mở CORS '*' nên mọi trang web trong Firefox/Safari — nơi chưa enforce
#  Private Network Access — đọc được pseudocode binary của bạn). Read-only.
#
#  ⚠ ĐÂY LÀ BẢN LEGACY. Bản được hỗ trợ là plugin Java trong ghidra-plugin/.
#    Từ Ghidra 12.0, script .py mặc định chạy bằng PyGhidra, còn Jython là
#    extension rời phải cài (File -> Install Extensions -> "Jython") — vì vậy
#    file này CHỈ chạy được khi đã bật extension Jython (nhờ dòng @runtime dưới).
#    Contract PHẢI khớp tests/mock_bridge.js + plugin Java (health/functions/
#    decompile/resolve/events). Mock chỉ để test tool-side khi không có Ghidra.
#
#  Yêu cầu: Ghidra >= 10.x với Jython 2.7. Không cần thư viện ngoài.
# =========================================================================
# @category Reverse Engineering
# @menupath Tools.PCODE Grapher Bridge
# @runtime Jython
# @author pcode-grapher
# =========================================================================

import json, os, threading, time
from java.net import InetSocketAddress
from java.io import IOException, File, FileInputStream
from com.sun.net.httpserver import HttpServer, HttpHandler
from java.util.concurrent import Executors

# ---- Ghidra API -----------------------------------------------------------
from ghidra.app.decompiler import DecompInterface
from ghidra.app.decompiler import ClangToken, ClangFuncNameToken, ClangVariableToken
from ghidra.program.util import ChangeManager        # ChangeManager ở package util, KHÔNG phải model.listing
try:
    from ghidra.program.util import ProgramEvent      # 11.1+: event type là enum
except Exception:
    ProgramEvent = None
try:
    from ghidra.framework.model import DomainObjectListener
except Exception:
    DomainObjectListener = object                     # Jython cũ: tự duck-type
from ghidra.program.model.symbol import SourceType
from ghidra.util.task import ConsoleTaskMonitor

# ---- cấu hình (chỉnh tại đây) --------------------------------------------
PORT            = 8765
HOST            = "127.0.0.1"
REQUIRE_TOKEN   = True           # False = MỌI trang web (Firefox/Safari, chưa chặn
                                 # Private Network Access) đọc được pseudocode của bạn
                                 # qua CORS `*`; chỉ tắt khi hiểu rõ rủi ro.
TIMEOUT_SECS    = 30             # timeout mỗi lần decompile
TOOL_DIR        = ""             # thư mục chứa index.html/js/css của tool;
                                 # để "" thì không phục vụ tool tĩnh (chỉ API).
ALLOWED_HOSTS   = ("127.0.0.1", "localhost", "0:0:0:0:0:0:0:1", "::1")

# ---- context dùng chung ---------------------------------------------------
class Ctx:
    pass
ctx = Ctx()
ctx.program = currentProgram
ctx.symtab  = currentProgram.getSymbolTable()
ctx.funcMgr = currentProgram.getFunctionManager()
ctx.refMgr  = currentProgram.getReferenceManager()
ctx.decomp  = None
ctx.lock    = threading.RLock()
ctx.sse     = []                 # các luồng SSE đang mở
ctx.token   = None
ctx.stop    = False
ctx.monitor = ConsoleTaskMonitor()

def setup_decompiler():
    d = DecompInterface()
    d.openProgram(currentProgram)
    d.setSimplificationStyle("decompile")
    try: d.toggleSyntaxTree(True)
    except: pass
    return d

# =========================================================================
#  Giúp: JSON / HTTP
# =========================================================================
def send_json(exch, code, obj):
    body = bytearray(json.dumps(obj, ensure_ascii=False).encode("utf-8"))
    h = exch.getResponseHeaders()
    h.set("Content-Type", "application/json; charset=utf-8")
    h.set("Access-Control-Allow-Origin", "*")
    h.set("Cache-Control", "no-store")
    exch.sendResponseHeaders(code, len(body))
    os_ = exch.getResponseBody()
    os_.write(body)
    os_.close()

def send_text(exch, code, txt, ctype="text/plain; charset=utf-8"):
    body = bytearray(txt.encode("utf-8"))
    h = exch.getResponseHeaders()
    h.set("Content-Type", ctype)
    h.set("Access-Control-Allow-Origin", "*")
    exch.sendResponseHeaders(code, len(body))
    os_ = exch.getResponseBody(); os_.write(body); os_.close()

def parse_query(qstr):
    q = {}
    if not qstr: return q
    for part in qstr.split("&"):
        if "=" in part:
            k, v = part.split("=", 1)
        else:
            k, v = part, ""
        from java.net import URLDecoder
        q[URLDecoder.decode(k, "UTF-8")] = URLDecoder.decode(v, "UTF-8")
    return q

def addr_hex(a):
    return "0x" + a.toString() if a is not None else None

def _host_name(header):
    # Tách host khỏi header "Host", chịu được IPv6 "[::1]:8765" (port tùy chọn).
    # Bản cũ split(":")[0] biến "[::1]:8765" thành "[" → loopback IPv6 LUÔN 403
    # dù có trong ALLOWED_HOSTS. Parity với hostName() của plugin Java
    # (so sánh tên host KHÔNG ngoặc — xem ALLOWED_HOSTS ở trên).
    h = (header or "").strip().lower()
    if h.startswith("["):
        end = h.find("]")
        return h[1:end] if end > 1 else ""
    return h.split(":")[0]

def security_ok(exch, q):
    # Host whitelist (chống DNS rebinding)
    host = _host_name(exch.getRequestHeaders().getFirst("Host"))
    if host not in ALLOWED_HOSTS:
        send_text(exch, 403, "forbidden host"); return False
    # token
    if REQUIRE_TOKEN and q.get("token", "") != ctx.token:
        send_text(exch, 401, "missing/invalid token"); return False
    return True

# =========================================================================
#  Giúp: decompile + build symbols (overlay live cho tool)
# =========================================================================
def decompile(func):
    with ctx.lock:
        res = ctx.decomp.decompileFunction(func, TIMEOUT_SECS, ctx.monitor)
        if res is None or not res.decompileCompleted():
            return None, False
        return res.getDecompiledFunction(), True

def symbol_info(sym, addr):
    st = sym.getSymbolType().toString()
    kind = "function" if "Function" in st else ("label" if "Label" in st else st.lower())
    try: src = sym.getSource().toString()
    except: src = "DEFAULT"
    dtype = None
    try:
        if "Function" in st:
            f = ctx.funcMgr.getFunctionAt(addr)
            if f is not None: dtype = f.getSignature().getPrototypeString(True, True)
        else:
            d = ctx.program.getListing().getDataAt(addr)
            if d is not None: dtype = d.getDataType().getName()
    except: pass
    return {"addr": addr_hex(addr), "name": sym.getName(True), "source": src,
            "kind": kind, "type": dtype}

# Dùng markup getCCodeMarkup() để lấy token CÓ ĐỊA CHỈ (không phải chuỗi C phẳng).
# Chỉ map các token là tên hàm / biến-toàn-cục (có symbol) → overlay cho tool.
def build_symbols(df):
    syms = {}
    root = df.getCCodeMarkup()
    if root is None: return syms
    def walk(node):
        if isinstance(node, (ClangFuncNameToken, ClangVariableToken)):
            txt = node.getText()
            a = node.getMinAddress()
            if txt and a is not None:
                sym = ctx.symtab.getPrimarySymbol(a)
                if sym is not None:
                    syms[txt] = symbol_info(sym, a)
        else:
            n = node.numChildren()
            for i in range(n):
                walk(node.Child(i))
    walk(root)
    return syms

# =========================================================================
#  Endpoint handlers
# =========================================================================
def h_health(exch, q):
    send_json(exch, 200, {
        "ok": True, "server": "ghidra",
        "program": currentProgram.getName(),
        "language": str(currentProgram.getLanguageID()),
        "addrSize": currentProgram.getAddressFactory().getDefaultAddressSpace().getSize(),
        "needsToken": REQUIRE_TOKEN,
        "apiVersion": 1,          # đồng bộ với plugin Java / mock
        "servesTool": False       # bản .py không serve Tool Dir
    })

def h_functions(exch, q):
    qq = (q.get("q", "") or "").lower()
    off = int(q.get("offset", "0") or "0")
    lim = min(int(q.get("limit", "500") or "500"), 2000)
    items = []
    for f in ctx.funcMgr.getFunctions(True):
        if f.isExternal(): continue
        nm = f.getName(True)
        if qq and qq not in nm.lower(): continue
        items.append({
            "name": nm, "entry": addr_hex(f.getEntryPoint()),
            "size": f.getBody().getNumAddresses(),
            "isExternal": False, "isThunk": f.isThunk(),
            "signature": f.getSignature().getPrototypeString(True, True)
        })
        # Quét dư 1 item để biết còn hàm khớp phía sau không (hasMore) mà không cần
        # duyệt hết program — parity với plugin Java + tests/mock_bridge.js
        # (client hiện "— còn nhiều hàm nữa —" để user gõ lọc thêm).
        if len(items) >= off + lim + 1: break
    has_more = len(items) > off + lim
    items = items[off:off + lim]
    send_json(exch, 200, {"items": items, "total": len(items), "returned": len(items),
                           "offset": off, "limit": lim, "hasMore": has_more})

def find_func(q):
    a = q.get("address", "")
    if a:
        try:
            addr = currentProgram.getAddressFactory().getDefaultAddressSpace().getAddress(long(a, 16))
            f = ctx.funcMgr.getFunctionAt(addr)
            if f is not None: return f
        except: pass
    nm = q.get("name", "")
    if nm:
        syms = ctx.symtab.getGlobalSymbols(nm)
        if syms is not None:
            for s in syms:
                f = ctx.funcMgr.getFunctionAt(s.getAddress())
                if f is not None: return f
    return None

def h_decompile(exch, q):
    f = find_func(q)
    if f is None:
        send_json(exch, 404, {"error": "function not found"}); return
    df, ok = decompile(f)
    if df is None:
        send_json(exch, 200, {"address": addr_hex(f.getEntryPoint()),
            "signature": f.getSignature().getPrototypeString(True, True),
            "pseudocode": "// decompile failed / timed out", "symbols": {},
            "timedOut": not ok, "warnings": ["decompile failed"]}); return
    send_json(exch, 200, {
        "address": addr_hex(f.getEntryPoint()),
        "signature": f.getSignature().getPrototypeString(True, True),
        "pseudocode": df.getC(),
        "symbols": build_symbols(df),
        "timedOut": False, "warnings": []
    })

def h_resolve(exch, q):
    out = {}
    for raw in (q.get("addresses", "") or "").split(","):
        raw = raw.strip()
        if not raw: continue
        try:
            a = currentProgram.getAddressFactory().getDefaultAddressSpace().getAddress(long(raw, 16))
            sym = ctx.symtab.getPrimarySymbol(a)
            out[raw] = symbol_info(sym, a) if sym is not None else {"name": None, "addr": raw}
        except:
            out[raw] = {"name": None}
    send_json(exch, 200, out)

# ---- SSE realtime ---------------------------------------------------------
def broadcast(obj):
    line = "data: " + json.dumps(obj, ensure_ascii=False) + "\n\n"
    dead = []
    for s in ctx.sse:
        try:
            s.write(bytearray(line.encode("utf-8"))); s.flush()
        except IOException:
            dead.append(s)
        except: dead.append(s)
    for s in dead:
        if s in ctx.sse: ctx.sse.remove(s)

def h_events(exch, q):
    h = exch.getResponseHeaders()
    h.set("Content-Type", "text/event-stream")
    h.set("Cache-Control", "no-cache")
    h.set("Connection", "keep-alive")
    h.set("Access-Control-Allow-Origin", "*")
    exch.sendResponseHeaders(200, 0)   # 0 = chunked, giữ mở
    os_ = exch.getResponseBody()
    ctx.sse.append(os_)
    try:
        os_.write(bytearray('event: hello\ndata: {"server":"ghidra"}\n\n'.encode("utf-8"))); os_.flush()
        while not ctx.stop:
            time.sleep(15.0)
            os_.write(bytearray(": ping\n\n".encode("utf-8"))); os_.flush()
    except IOException: pass
    except: pass
    finally:
        if os_ in ctx.sse: ctx.sse.remove(os_)
        try: os_.close()
        except: pass

# ---- lắng nghe thay đổi trong Ghidra → phát SSE ---------------------------
# ChangeManager không hề có FIELD EVENT_SYMBOL_* (nên bản cũ ném AttributeError
# ở MỖI sự kiện, và rename không bao giờ được phát). Tên thật là DOCR_SYMBOL_*;
# từ Ghidra 11.1 chúng là alias đã deprecated của enum ghidra.program.util.ProgramEvent.
def _event(name):
    for holder in (ProgramEvent, ChangeManager):
        if holder is None:
            continue
        v = getattr(holder, name, None)
        if v is not None:
            return v
    return None

_SYMBOL_EVENTS = tuple(x for x in (
    _event('DOCR_SYMBOL_RENAMED'), _event('DOCR_SYMBOL_ADDED'),
    _event('DOCR_SYMBOL_REMOVED'), _event('DOCR_SYMBOL_CHANGED'),
    _event('DOCR_SYMBOL_DATA_TYPE_CHANGED'), _event('DOCR_SYMBOL_SOURCE_CHANGED'),
    _event('DOCR_SYMBOL_SET_AS_PRIMARY')) if x is not None)


class ChangeListener(DomainObjectListener):
    def domainObjectChanged(self, ev):
        try:
            n = ev.numEvents()
            for i in range(n):
                ce = ev.getEvent(i)
                et = ce.getEventType()
                if et in _SYMBOL_EVENTS:
                    a = ce.getAddress()
                    if a is None: continue
                    sym = ctx.symtab.getPrimarySymbol(a)
                    nm = sym.getName(True) if sym is not None else None
                    src = (sym.getSource().toString() if (sym is not None) else "DEFAULT")
                    broadcast({"type": "symbolRenamed", "address": addr_hex(a),
                               "oldName": None, "newName": nm, "source": src,
                               "ts": int(time.time() * 1000)})
        except Exception as e:
            println("bridge: change-listener error: " + str(e))

# =========================================================================
#  Router + static serving
# =========================================================================
ROUTES = {
    "/api/health": h_health,
    "/api/functions": h_functions,
    "/api/decompile": h_decompile,
    "/api/resolve": h_resolve,
}

MIME = {".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8", ".png": "image/png", ".json": "application/json"}

class Handler(HttpHandler):
    def handle(self, exch):
        try:
            from java.net import URI
            uri = exch.getRequestURI()
            path = uri.getPath()
            q = parse_query(uri.getQuery())
            if exch.getRequestMethod() == "OPTIONS":   # CORS preflight
                h = exch.getResponseHeaders()
                h.set("Access-Control-Allow-Origin", "*")
                h.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
                h.set("Access-Control-Allow-Headers", "Content-Type, X-Bridge-Token")
                exch.sendResponseHeaders(204, -1); return
            if path == "/events":
                if security_ok(exch, q): h_events(exch, q)
                return
            if path in ROUTES:
                if security_ok(exch, q): ROUTES[path](exch, q)
                return
            # phục vụ file tĩnh của tool (cùng origin → không cần CORS)
            self.serve_static(exch, path)
        except Exception as e:
            try: send_json(exch, 500, {"error": str(e)})
            except: pass
            println("bridge error: " + str(e))

    def serve_static(self, exch, path):
        if not TOOL_DIR:
            send_text(exch, 200,
                "<h3>PCODE Grapher bridge đang chạy</h3>"
                "<p>Mở tool (index.html) rồi nhập URL này vào ô <b>GHIDRA LIVE</b>: "
                "<code>http://" + HOST + ":" + str(PORT) + "/</code></p>"
                "<p>(Đặt <code>TOOL_DIR</code> trong script nếu muốn cầu phục vụ luôn tool.)</p>",
                "text/html; charset=utf-8"); return
        rel = "index.html" if path in ("/", "") else path.lstrip("/")
        f = File(os.path.join(TOOL_DIR, rel))
        if not f.exists() or f.isDirectory():
            send_text(exch, 404, "not found"); return
        ext = os.path.splitext(rel)[1].lower()
        ctype = MIME.get(ext, "application/octet-stream")
        body = bytearray()
        fis = FileInputStream(f)
        try:
            buf = bytearray(8192)
            while True:
                r = fis.read(buf)
                if r < 0: break
                body += buf[:r]
        finally:
            fis.close()
        h = exch.getResponseHeaders(); h.set("Content-Type", ctype)
        # U6: assets/ tên-hash → cache vĩnh viễn an toàn; index.html & file không-hash
        # → no-cache (rebuild xong F5 là bản mới, khỏi cần token/URL mới).
        h.set("Cache-Control",
              "public, max-age=31536000, immutable" if rel.startswith("assets/")
              else "no-cache, must-revalidate")
        exch.sendResponseHeaders(200, len(body))
        os_ = exch.getResponseBody(); os_.write(body); os_.close()

# =========================================================================
#  main
# =========================================================================
ctx.decomp = setup_decompiler()
if REQUIRE_TOKEN:
    import uuid
    ctx.token = uuid.uuid4().hex[:16]

listener = ChangeListener()
currentProgram.addListener(listener)

server = HttpServer.create(InetSocketAddress(HOST, PORT), 0)
server.createContext("/", Handler())
server.setExecutor(Executors.newFixedThreadPool(6))
server.start()

url = "http://" + HOST + ":" + str(PORT) + "/"
println("=" * 60)
println(" PCODE Grapher bridge ĐANG CHẠY")
println("   URL   : " + url + (("?token=" + ctx.token) if REQUIRE_TOKEN else ""))
println("   Program: " + currentProgram.getName())
println("   Đang phục vụ API + SSE. Mở PCODE Grapher, dán URL vào ô GHIDRA LIVE.")
println("   DỪNG: huỷ script trong Script Manager (nút cancel).")
println("=" * 60)

# giữ script sống tới khi user huỷ
try:
    while not ctx.stop and not monitor.isCancel():
        time.sleep(1.0)
except: pass
finally:
    ctx.stop = True
    try: currentProgram.removeListener(listener)
    except: pass
    try: server.stop(1)
    except: pass
    try: ctx.decomp.dispose()
    except: pass
    println(" PCODE Grapher bridge đã dừng.")
