package com.pcodegrapher;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import docking.action.DockingAction;
import docking.action.KeyBindingData;
import docking.action.MenuData;

import ghidra.app.DeveloperPluginPackage;
import ghidra.app.context.ListingActionContext;
import ghidra.app.decompiler.ClangFuncNameToken;
import ghidra.app.decompiler.ClangNode;
import ghidra.app.decompiler.ClangToken;
import ghidra.app.decompiler.ClangVariableToken;
import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileOptions;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.decompiler.DecompiledFunction;
import ghidra.app.decompiler.component.DecompilerUtils;
import ghidra.app.plugin.PluginCategoryNames;
import ghidra.app.plugin.ProgramPlugin;
import ghidra.app.plugin.core.decompile.DecompilerActionContext;
import ghidra.framework.model.DomainObjectChangeRecord;
import ghidra.framework.model.DomainObjectChangedEvent;
import ghidra.framework.model.DomainObjectListener;
import ghidra.framework.options.OptionType;
import ghidra.framework.options.ToolOptions;
import ghidra.framework.plugintool.PluginInfo;
import ghidra.framework.plugintool.PluginTool;
import ghidra.framework.plugintool.util.PluginStatus;
import ghidra.program.model.address.Address;
import ghidra.program.model.address.AddressFactory;
import ghidra.program.model.listing.Data;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.FunctionManager;
import ghidra.program.model.listing.Program;
import ghidra.program.model.symbol.Symbol;
import ghidra.program.model.symbol.SymbolTable;
import ghidra.program.model.symbol.SymbolType;
import ghidra.program.util.ChangeManager;
import ghidra.program.util.ProgramChangeRecord;
import ghidra.util.Msg;
import ghidra.util.SystemUtilities;
import ghidra.util.task.ConsoleTaskMonitor;

import java.awt.event.InputEvent;
import java.awt.event.KeyEvent;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Local, read-only HTTP/SSE bridge between an active Ghidra program and PCODE Grapher.
 *
 * The bridge deliberately binds only to loopback.  Its public API is consumed by the
 * browser UI and is kept intentionally small:
 *   GET /api/health, /api/functions, /api/decompile, /api/resolve, /api/goto, /events
 *
 * Two-way function sync ("grapher <-> CodeBrowser"):
 *   - Ghidra -> Tool: right-click a function in the CodeBrowser Listing OR the Decompiler and
 *     choose "PCODE Grapher -> Đồng bộ hàm tới PCODE Grapher" (or press Ctrl+Shift+G). The
 *     plugin broadcasts an SSE `syncFunction` event {address,name,program}; the browser opens it.
 *     (Works for both ListingActionContext and DecompilerActionContext.)
 *   - Tool -> Ghidra: the browser calls GET /api/goto?address=<entry>; this plugin dequeues
 *     the navigation onto the Swing thread via GoToService and jumps the CodeBrowser cursor.
 */
@PluginInfo(
        status = PluginStatus.RELEASED,
        packageName = DeveloperPluginPackage.NAME,
        category = PluginCategoryNames.ANALYSIS,
        shortDescription = "PCODE Grapher HTTP bridge",
        description = "A local HTTP/SSE bridge for PCODE Grapher: decompilation, symbol overlay, and live rename updates."
)
public class PcodeGrapherPlugin extends ProgramPlugin {

    private static final String VERSION = "1.8.2";
    private static final int DEFAULT_PORT = 8765;
    private static final int DECOMPILE_TIMEOUT_SECONDS = 30;
    private static final int MAX_FUNCTION_LIMIT = 2000;
    // SSE giữ thread lâu dài -> phải có trần, nếu không cached pool lớn vô hạn.
    private static final int MAX_SSE_CLIENTS = 24;
    private static final Set<String> ALLOWED_HOSTS = Set.of(
            "127.0.0.1", "localhost", "::1", "0:0:0:0:0:0:0:1");

    private final ToolOptions options;
    private final Object serverLock = new Object();
    private final Object decompLock = new Object();
    private final List<OutputStream> sseClients = new CopyOnWriteArrayList<>();

    private volatile HttpServer server;
    private volatile ExecutorService httpExecutor;
    private volatile int port = DEFAULT_PORT;
    private volatile boolean requireToken;
    private volatile String token;
    private volatile String toolDir = "";
    private volatile Program activeProgram;
    private DecompInterface decomp;

    public PcodeGrapherPlugin(PluginTool tool) {
        super(tool);
        options = tool.getOptions("PCODE Grapher");
        options.registerOption("Port", OptionType.INT_TYPE, DEFAULT_PORT, null,
                "Local HTTP port for the PCODE Grapher bridge (1024-65535).");
        // Mặc định TRƯỚC là false -> bridge mở CORS `Access-Control-Allow-Origin: *`
        // mà không cần token: mọi trang web trong Firefox/Safari (nơi chưa enforce
        // Private Network Access) đều đọc được pseudocode binary của người dùng.
        // Host-whitelist không cứu được: trang độc hại không gửi Host: 127.0.0.1.
        options.registerOption("Require Token", OptionType.BOOLEAN_TYPE, true, null,
                "Require a token for every bridge request (recommended: keep on).");
        options.registerOption("Token", OptionType.STRING_TYPE, "", null,
                "Optional fixed token. Leave blank to generate a token whenever the server starts.");
        options.registerOption("Tool Dir", OptionType.STRING_TYPE, "", null,
                "Optional directory containing PCODE Grapher index.html. Leave blank for API-only mode.");
        registerActions();
        startServer();
    }

    /**
     * A plugin can be enabled after CodeBrowser already has a program selected.  ProgramPlugin
     * normally receives an activation event, but this guard makes the active-program snapshot
     * reliable in both startup orders.
     */
    @Override
    protected void init() {
        super.init();
        Program p = currentProgram;
        if (p != null && activeProgram != p) {
            activateProgram(p);
        }
    }

    @Override
    protected void programActivated(Program program) {
        if (program != null && activeProgram != program) {
            activateProgram(program);
        }
    }

    @Override
    protected void programDeactivated(Program program) {
        if (program == null || activeProgram != program) {
            return;
        }
        deactivateProgram(program);
        Map<String, Object> event = baseEvent("programDeactivated");
        event.put("program", program.getName());
        broadcast(event);
    }

    private void activateProgram(Program program) {
        Program old = activeProgram;
        if (old != null && old != program) {
            try {
                old.removeListener(changeListener);
            } catch (Exception ignored) {
                // Program may have been disposed while the tool changes programs.
            }
        }
        synchronized (decompLock) {
            disposeDecompiler();
            activeProgram = program;
            decomp = new DecompInterface();
            try {
                // Match the interactive Decompiler window. A fresh DecompInterface uses its own
                // DEFAULT options, which differ from the tool's options -> the bridge produced a
                // different decompilation (e.g. array reads not folded to literals, hex vs decimal
                // numbers). DecompilerUtils.getDecompileOptions(tool, program) reads back the exact
                // options the Decompiler tool consumes (the same ones the GUI window uses), so the
                // compiled C matches what the user sees in Ghidra.
                decomp.setOptions(DecompilerUtils.getDecompileOptions(tool, program));
            } catch (Throwable ignored) {
                // If the tool's decompiler options are unavailable, fall back to defaults.
            }
            if (!decomp.openProgram(program)) {
                Msg.warn(this, "PCODE Grapher: could not open program in the decompiler: " + program.getName());
                decomp.dispose();
                decomp = null;
            } else {
                decomp.setSimplificationStyle("decompile");
                try {
                    decomp.toggleSyntaxTree(true);
                } catch (Throwable ignored) {
                    // C markup is optional in older Ghidra builds; normal C output still works.
                }
            }
        }
        program.addListener(changeListener);
        Msg.info(this, "PCODE Grapher: active program = " + program.getName());
        Map<String, Object> event = baseEvent("programActivated");
        event.put("program", program.getName());
        event.put("language", program.getLanguageID().toString());
        broadcast(event);
    }

    private void deactivateProgram(Program program) {
        try {
            program.removeListener(changeListener);
        } catch (Exception ignored) {
            // Safe during shutdown and program teardown.
        }
        synchronized (decompLock) {
            if (activeProgram == program) {
                activeProgram = null;
                disposeDecompiler();
            }
        }
    }

    private void disposeDecompiler() {
        if (decomp != null) {
            try {
                decomp.dispose();
            } catch (Exception ignored) {
                // Disposal must not prevent the new program/server from being available.
            }
            decomp = null;
        }
    }

    @Override
    public void dispose() {
        Program p = activeProgram;
        if (p != null) {
            deactivateProgram(p);
        }
        stopServer();
        super.dispose();
    }

    private void registerActions() {
        DockingAction restart = new DockingAction("PCODE Grapher Bridge: Restart", getName()) {
            @Override
            public void actionPerformed(docking.ActionContext context) {
                restartServer();
            }
        };
        restart.setMenuBarData(new MenuData(
                new String[] { "Tools", "PCODE Grapher Bridge", "Restart server" }));
        restart.setEnabled(true);
        tool.addAction(restart);

        // This action avoids ambiguity around the Tool Options dialog and makes
        // token generation a one-click, observable operation for an active tool.
        DockingAction generateToken = new DockingAction("PCODE Grapher Bridge: Generate token and restart", getName()) {
            @Override
            public void actionPerformed(docking.ActionContext context) {
                options.setBoolean("Require Token", true);
                options.setString("Token", "");
                token = null; // force loadServerOptions() to create a fresh token
                restartServer();
            }
        };
        generateToken.setMenuBarData(new MenuData(
                new String[] { "Tools", "PCODE Grapher Bridge", "Generate token and restart" }));
        generateToken.setEnabled(true);
        tool.addAction(generateToken);

        // Right-click in the CodeBrowser Listing (or Decompiler) on a function -> tell
        // PCODE Grapher to open/decompile that exact function. This is the "Ghidra -> Tool"
        // half of the two-way sync: it only ever broadcasts an SSE event; the tool's
        // EventSource handler calls /api/decompile on the corresponding entry point.
        // Bound in the Listing popup via setPopupMenuData; the key binding is Ctrl+Shift+G
        // (reassignable in Edit -> Tool Options -> Key Bindings, or press F4 over the item).
        DockingAction sync = new DockingAction("PCODE Grapher Bridge: Đồng bộ hàm tới PCODE Grapher", getName()) {
            @Override
            public boolean isEnabledForContext(docking.ActionContext context) {
                // The popup appears in BOTH the Listing (Ghidra -> Tool: asm) and the
                // Decompiler window. Each provides a different ActionContext subtype, so
                // accept either. The default implementation defers popup membership to
                // isEnabledForContext, so returning false hides the item entirely.
                if (context instanceof ListingActionContext) {
                    return functionUnderCursor((ListingActionContext) context) != null;
                }
                if (context instanceof DecompilerActionContext) {
                    // The function currently shown in the Decompiler; hasRealFunction() is
                    // false for the undefined/placeholder function, which we should not sync.
                    return ((DecompilerActionContext) context).hasRealFunction();
                }
                return false;
            }

            @Override
            public void actionPerformed(docking.ActionContext context) {
                Function function = null;
                Program program = null;
                if (context instanceof ListingActionContext) {
                    ListingActionContext listing = (ListingActionContext) context;
                    function = functionUnderCursor(listing);
                    program = listing.getProgram();
                } else if (context instanceof DecompilerActionContext) {
                    DecompilerActionContext decompiler = (DecompilerActionContext) context;
                    if (decompiler.hasRealFunction()) {
                        function = decompiler.getFunction();
                    }
                    program = decompiler.getProgram();
                }
                if (function == null) {
                    Msg.warn(PcodeGrapherPlugin.this,
                            "PCODE Grapher: no function to sync at this location.");
                    return;
                }
                Map<String, Object> event = baseEvent("syncFunction");
                event.put("address", addressText(function.getEntryPoint()));
                event.put("name", function.getName(true));
                event.put("program", program == null ? null : program.getName());
                broadcast(event);
                Msg.info(PcodeGrapherPlugin.this,
                        "PCODE Grapher: đồng bộ hàm " + function.getName(true)
                        + " @" + addressText(function.getEntryPoint())
                        + (sseClients.isEmpty() ? " (chưa có tool nào kết nối)" : ""));
            }
        };
        sync.setPopupMenuData(new MenuData(
                new String[] { "PCODE Grapher", "Đồng bộ hàm tới PCODE Grapher" }, "PCODE Grapher"));
        sync.setKeyBindingData(new KeyBindingData(KeyEvent.VK_G,
                InputEvent.CTRL_DOWN_MASK | InputEvent.SHIFT_DOWN_MASK));
        tool.addAction(sync);
    }

    /** Return the function at (or containing) the Listing location, or null. */
    private static Function functionUnderCursor(ListingActionContext context) {
        Program program = context.getProgram();
        if (program == null) {
            return null;
        }
        Address address = context.getAddress();
        if (address == null) {
            return null;
        }
        FunctionManager manager = program.getFunctionManager();
        Function function = manager.getFunctionContaining(address);
        if (function == null) {
            function = manager.getFunctionAt(address);
        }
        return function;
    }

    private void restartServer() {
        stopServer();
        startServer();
    }

    /** Read Tool Options at every start so the documented Restart action really applies them. */
    private void loadServerOptions() {
        int requestedPort = options.getInt("Port", DEFAULT_PORT);
        port = requestedPort >= 1024 && requestedPort <= 65535 ? requestedPort : DEFAULT_PORT;
        requireToken = options.getBoolean("Require Token", true);
        toolDir = trimToEmpty(options.getString("Tool Dir", ""));
        String configuredToken = trimToEmpty(options.getString("Token", ""));
        if (!requireToken) {
            token = null;
        } else if (!configuredToken.isEmpty()) {
            token = configuredToken;
        } else if (token == null || token.isEmpty()) {
            token = UUID.randomUUID().toString().replace("-", "").substring(0, 24);
        }
    }

    private void startServer() {
        synchronized (serverLock) {
            if (server != null) {
                return;
            }
            loadServerOptions();
            try {
                HttpServer newServer = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 0);
                // handleEvents() GIỮ nguyên thread trong suốt vòng đời một EventSource
                // (vòng lặp sleep 15s gửi ping). Với newFixedThreadPool(8), 8 tab mở là
                // toàn bộ pool bị SSE chiếm -> mọi /api/* xếp hàng chờ vô thời hạn, tool
                // trông như Ghidra treo. newCachedThreadPool + trần số client (MAX_SSE_CLIENTS
                // ở handleEvents) là cách giữ hành vi mà không hết chỗ.
                ExecutorService executor = Executors.newCachedThreadPool(runnable -> {
                    Thread thread = new Thread(runnable, "PcodeGrapherBridge-HTTP");
                    thread.setDaemon(true);
                    return thread;
                });
                newServer.createContext("/", new RootHandler());
                newServer.setExecutor(executor);
                newServer.start();
                server = newServer;
                httpExecutor = executor;
                String url = "http://127.0.0.1:" + port + "/";
                Msg.info(this, "PCODE Grapher bridge: " + url
                        + (token == null ? "" : "?token=" + token));
                if (!requireToken) {
                    Msg.info(this, "PCODE Grapher bridge security: Require Token=false; token is disabled and will not be printed. "
                            + "Use Tools > PCODE Grapher Bridge > Generate token and restart to enable it.");
                } else if (trimToEmpty(options.getString("Token", "")).isEmpty()) {
                    Msg.info(this, "PCODE Grapher bridge generated token: " + token);
                } else {
                    Msg.info(this, "PCODE Grapher bridge security: Require Token=true; using the configured token.");
                }
            } catch (IOException e) {
                server = null;
                Msg.warn(this, "PCODE Grapher bridge failed to start on port " + port + ": " + e.getMessage());
            }
        }
    }

    private void stopServer() {
        synchronized (serverLock) {
            for (OutputStream output : sseClients) {
                try {
                    output.close();
                } catch (IOException ignored) {
                    // Closing an already-disconnected EventSource is expected.
                }
            }
            sseClients.clear();
            if (server != null) {
                server.stop(1);
                server = null;
            }
            if (httpExecutor != null) {
                httpExecutor.shutdownNow();
                httpExecutor = null;
            }
        }
    }

    private class RootHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            try {
                Map<String, String> query = parseQuery(exchange.getRequestURI().getRawQuery());
                if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
                    cors(exchange);
                    exchange.sendResponseHeaders(204, -1);
                    return;
                }
                String path = exchange.getRequestURI().getPath();
                // Tool assets are safe to serve from loopback without a token. This matters
                // when Token mode is enabled: index.html may be opened as /?token=..., but
                // its relative CSS/JS requests do not retain that query string. API + SSE
                // remain authenticated on every request.
                if (!hostOk(exchange) ||
                        ((path.startsWith("/api/") || path.equals("/events")) && !tokenOk(exchange, query))) {
                    return;
                }
                switch (path) {
                    case "/api/health":
                        handleHealth(exchange);
                        break;
                    case "/api/functions":
                        handleFunctions(exchange, query);
                        break;
                    case "/api/decompile":
                        handleDecompile(exchange, query);
                        break;
                    case "/api/resolve":
                        handleResolve(exchange, query);
                        break;
                    case "/api/goto":
                        handleGoto(exchange, query);
                        break;
                    case "/events":
                        handleEvents(exchange);
                        break;
                    default:
                        serveStatic(exchange, path);
                        break;
                }
            } catch (Exception e) {
                String message = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
                try {
                    sendJson(exchange, 500, err(message));
                } catch (Exception ignored) {
                    // The peer may have gone away before the error response was written.
                }
                Msg.warn(PcodeGrapherPlugin.this, "PCODE Grapher bridge request failed: " + message);
            } finally {
                try {
                    exchange.close();
                } catch (Exception ignored) {
                    // HttpExchange has already released its resources.
                }
            }
        }
    }

    private boolean hostOk(HttpExchange exchange) throws IOException {
        String host = hostName(exchange.getRequestHeaders().getFirst("Host"));
        if (!ALLOWED_HOSTS.contains(host)) {
            sendText(exchange, 403, "forbidden host");
            return false;
        }
        return true;
    }

    private boolean tokenOk(HttpExchange exchange, Map<String, String> query) throws IOException {
        if (!requireToken) {
            return true;
        }
        String supplied = query.get("token");
        if (supplied == null || supplied.isEmpty()) {
            supplied = exchange.getRequestHeaders().getFirst("X-Bridge-Token");
        }
        if (supplied == null || token == null ||
                !MessageDigest.isEqual(token.getBytes(StandardCharsets.UTF_8),
                        supplied.getBytes(StandardCharsets.UTF_8))) {
            sendText(exchange, 401, "missing/invalid token");
            return false;
        }
        return true;
    }

    private static String hostName(String header) {
        if (header == null) {
            return "";
        }
        String host = header.trim().toLowerCase();
        if (host.startsWith("[")) {
            int end = host.indexOf(']');
            return end > 1 ? host.substring(1, end) : "";
        }
        int portAt = host.indexOf(':');
        return portAt >= 0 ? host.substring(0, portAt) : host;
    }

    private void handleHealth(HttpExchange exchange) throws IOException {
        Program p = activeProgram;
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", p != null);
        out.put("server", "ghidra");
        out.put("version", VERSION);
        out.put("apiVersion", 1);
        out.put("program", p == null ? null : p.getName());
        out.put("language", p == null ? null : p.getLanguageID().toString());
        out.put("addrSize", p == null ? 0 : p.getAddressFactory().getDefaultAddressSpace().getSize());
        out.put("needsToken", requireToken);
        boolean servesTool = hasHostedTool();
        out.put("servesTool", servesTool);
        if (servesTool) out.put("toolUrl", bridgeRootUrl());
        sendJson(exchange, 200, out);
    }

    private void handleFunctions(HttpExchange exchange, Map<String, String> query) throws IOException {
        Program p = activeProgram;
        if (p == null) {
            sendJson(exchange, 409, err("no active program"));
            return;
        }
        String filter = query.getOrDefault("q", "").toLowerCase();
        int limit = Math.max(1, Math.min(parseInt(query.get("limit"), 500), MAX_FUNCTION_LIMIT));
        int offset = Math.max(0, parseInt(query.get("offset"), 0));
        int matched = 0;
        boolean hasMore = false;
        List<Map<String, Object>> items = new ArrayList<>();
        FunctionManager manager = p.getFunctionManager();
        for (Function function : manager.getFunctions(true)) {
            if (function.isExternal()) {
                continue;
            }
            String name = function.getName(true);
            if (!filter.isEmpty() && !name.toLowerCase().contains(filter)) {
                continue;
            }
            if (matched++ < offset) {
                continue;
            }
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("name", name);
            item.put("entry", addressText(function.getEntryPoint()));
            item.put("size", function.getBody().getNumAddresses());
            item.put("isExternal", false);
            item.put("isThunk", function.isThunk());
            item.put("signature", function.getSignature().getPrototypeString(true));
            items.add(item);
            if (items.size() >= limit) {
                hasMore = true;   // còn hàm khớp nhưng ta dừng ở limit
                break;
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", items);
        out.put("total", items.size()); // This is the returned count; enumeration is intentionally capped.
        out.put("returned", items.size());
        out.put("hasMore", hasMore);     // client phải biết là danh sách bị cắt ở limit
        out.put("limit", limit);
        out.put("offset", offset);
        sendJson(exchange, 200, out);
    }

    private void handleDecompile(HttpExchange exchange, Map<String, String> query) throws IOException {
        Program p = activeProgram;
        if (p == null) {
            sendJson(exchange, 409, err("no active program"));
            return;
        }
        Function function = findFunction(p, query);
        if (function == null) {
            sendJson(exchange, 404, err("function not found"));
            return;
        }
        Map<String, Object> out = new LinkedHashMap<>();
        boolean programChanged = false;
        synchronized (decompLock) {
            // Do not decompile a function belonging to a program that was switched while this
            // HTTP request waited for the decompiler lock.
            if (p != activeProgram || decomp == null) {
                programChanged = true;
            } else {
                out.put("address", addressText(function.getEntryPoint()));
                out.put("signature", function.getSignature().getPrototypeString(true));
                DecompileResults result = decomp.decompileFunction(function,
                        DECOMPILE_TIMEOUT_SECONDS, new ConsoleTaskMonitor());
                if (result == null || !result.decompileCompleted()) {
                    out.put("pseudocode", "// decompile failed or timed out");
                    out.put("symbols", new LinkedHashMap<String, Object>());
                    out.put("timedOut", true);
                    out.put("warnings", List.of("decompile failed or timed out"));
                } else {
                    DecompiledFunction decompiled = result.getDecompiledFunction();
                    out.put("pseudocode", decompiled.getC());
                    out.put("symbols", buildSymbols(p, result.getCCodeMarkup()));
                    out.put("timedOut", false);
                    out.put("warnings", new ArrayList<String>());
                }
            }
        }
        // sendJson ở NGOÀI decompLock: ghi socket chậm (tab nền, proxy, client treo)
        // trong khi vẫn giữ khoá sẽ chặn mọi request decompile khác — kể cả UI
        // Ghidra đang chờ cùng khoá đó.
        if (programChanged) {
            sendJson(exchange, 409, err("active program changed; retry"));
            return;
        }
        sendJson(exchange, 200, out);
    }

    private Map<String, Object> buildSymbols(Program program, ClangNode root) {
        Map<String, Object> symbols = new LinkedHashMap<>();
        if (root == null || program == null) {
            return symbols;
        }
        SymbolTable symbolTable = program.getSymbolTable();
        walkMarkup(program, symbolTable, root, symbols);
        return symbols;
    }

    private void walkMarkup(Program program, SymbolTable symbolTable, ClangNode node,
            Map<String, Object> symbols) {
        if (node instanceof ClangFuncNameToken || node instanceof ClangVariableToken) {
            ClangToken tokenNode = (ClangToken) node;
            String text = tokenNode.getText();
            Address address = tokenNode.getMinAddress();
            Symbol symbol = address != null ? symbolTable.getPrimarySymbol(address) : null;
            if (symbol == null && node instanceof ClangVariableToken) {
                // U9: biến cục bộ/tham số KHÔNG tra được theo địa chỉ code trong
                // bảng symbol chương trình (chỉ hàm/nhãn/toàn-cục) → trước đây
                // local var không nằm trong map symbols nên SSE rename của nó
                // rơi vào địa chỉ lạ → tool bỏ qua ("phải F5 mới thấy tên mới").
                // Lấy HighSymbol của token decompiler (địa chỉ stack) thay thế.
                try {
                    ghidra.app.decompiler.HighSymbol high = tokenNode.getHighSymbol();
                    if (high != null) {
                        symbol = high.getSymbol();
                    }
                } catch (Exception ignored) {
                    // Token không gắn HighSymbol (vd. cast tạm) — bỏ qua.
                }
            }
            if (text != null && !text.isEmpty() && symbol != null) {
                // The browser contract is keyed by pseudocode token text. Keep the first
                // mapping when Ghidra emits the same spelling for multiple markup nodes.
                symbols.putIfAbsent(text, symbolInfo(program, symbol, symbol.getAddress()));
            }
            return;
        }
        int children = node.numChildren();
        for (int i = 0; i < children; i++) {
            walkMarkup(program, symbolTable, node.Child(i), symbols);
        }
    }

    private Map<String, Object> symbolInfo(Program program, Symbol symbol, Address address) {
        Map<String, Object> out = new LinkedHashMap<>();
        SymbolType type = symbol.getSymbolType();
        String typeName = type.toString();
        String kind = typeName.contains("Function") ? "function"
                : (typeName.contains("Label") ? "label" : typeName.toLowerCase());
        out.put("addr", addressText(address));
        out.put("name", symbol.getName(true));
        out.put("source", symbol.getSource().name());
        out.put("kind", kind);
        String dataType = null;
        if (typeName.contains("Function")) {
            Function function = program.getFunctionManager().getFunctionAt(address);
            if (function != null) {
                dataType = function.getSignature().getPrototypeString(true);
            }
        } else {
            Data data = program.getListing().getDataAt(address);
            if (data != null) {
                dataType = data.getDataType().getName();
            }
        }
        out.put("type", dataType);
        return out;
    }

    private void handleResolve(HttpExchange exchange, Map<String, String> query) throws IOException {
        Program p = activeProgram;
        Map<String, Object> out = new LinkedHashMap<>();
        if (p == null) {
            sendJson(exchange, 200, out);
            return;
        }
        SymbolTable symbolTable = p.getSymbolTable();
        for (String raw : query.getOrDefault("addresses", "").split(",")) {
            raw = raw.trim();
            if (raw.isEmpty()) {
                continue;
            }
            Address address = parseAddress(p.getAddressFactory(), raw);
            Symbol symbol = address == null ? null : symbolTable.getPrimarySymbol(address);
            out.put(raw, symbol == null ? nameOnly(null) : symbolInfo(p, symbol, address));
        }
        sendJson(exchange, 200, out);
    }

    /**
     * Tool -> Ghidra navigation: move the CodeBrowser cursor to the function/address the
     * browser is currently showing. This is "read-only" from a program-metadata standpoint
     * (nothing is edited) but it does move the UI cursor, so it must run on the Swing thread.
     * ProgramPlugin.goTo(Address) posts the standard navigation even and returns true if the
     * target belongs to the active program.
     */
    private void handleGoto(HttpExchange exchange, Map<String, String> query) throws IOException {
        Program p = activeProgram;
        if (p == null) {
            sendJson(exchange, 409, err("no active program"));
            return;
        }
        String rawAddress = query.get("address");
        if (rawAddress == null || rawAddress.isEmpty()) {
            sendJson(exchange, 400, err("missing 'address'"));
            return;
        }
        Address address = parseAddress(p.getAddressFactory(), rawAddress);
        if (address == null) {
            sendJson(exchange, 400, err("invalid address: " + rawAddress));
            return;
        }
        final Address target = address;
        AtomicBoolean ok = new AtomicBoolean(false);
        SystemUtilities.runSwingNow(() -> ok.set(goTo(target)));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", ok.get());
        out.put("address", addressText(target));
        if (!ok.get()) {
            out.put("error", "goto failed (address outside active program?)");
        }
        sendJson(exchange, 200, out);
    }

    private Function findFunction(Program program, Map<String, String> query) {
        FunctionManager manager = program.getFunctionManager();
        String addressText = query.get("address");
        if (addressText != null && !addressText.isEmpty()) {
            Address address = parseAddress(program.getAddressFactory(), addressText);
            if (address != null) {
                Function function = manager.getFunctionAt(address);
                if (function != null) {
                    return function;
                }
            }
        }
        String name = query.get("name");
        if (name != null && !name.isEmpty()) {
            for (Symbol symbol : program.getSymbolTable().getGlobalSymbols(name)) {
                Function function = manager.getFunctionAt(symbol.getAddress());
                if (function != null) {
                    return function;
                }
            }
        }
        return null;
    }

    private static Address parseAddress(AddressFactory factory, String raw) {
        try {
            Address address = factory.getAddress(raw.trim());
            if (address != null) {
                return address;
            }
        } catch (Exception ignored) {
            // Fall through to the default address space parser below.
        }
        try {
            return factory.getDefaultAddressSpace().getAddress(raw.trim());
        } catch (Exception ignored) {
            return null;
        }
    }

    private static String addressText(Address address) {
        if (address == null) {
            return null;
        }
        String text = address.toString();
        return text.startsWith("0x") || text.contains(":") ? text : "0x" + text;
    }

    private boolean hasHostedTool() {
        if (toolDir.isEmpty()) return false;
        try {
            Path root = Paths.get(toolDir).toRealPath();
            return Files.isRegularFile(root.resolve("index.html"));
        } catch (Exception ignored) {
            return false;
        }
    }

    private String bridgeRootUrl() {
        String url = "http://127.0.0.1:" + port + "/";
        return token == null ? url : url + "?token=" + token;
    }

    private void handleEvents(HttpExchange exchange) throws IOException {
        if (sseClients.size() >= MAX_SSE_CLIENTS) {
            sendJson(exchange, 503, err("too many EventSource clients (max " + MAX_SSE_CLIENTS + ")"));
            return;
        }
        exchange.getResponseHeaders().set("Content-Type", "text/event-stream; charset=utf-8");
        exchange.getResponseHeaders().set("Cache-Control", "no-cache, no-store");
        exchange.getResponseHeaders().set("Connection", "keep-alive");
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.sendResponseHeaders(200, 0); // chunked: keep the EventSource stream open
        OutputStream output = exchange.getResponseBody();
        sseClients.add(output);
        try {
            writeSse(output, "event: hello\ndata: {\"server\":\"ghidra\",\"version\":\"" + VERSION + "\"}\n\n");
            while (!Thread.currentThread().isInterrupted()) {
                try {
                    Thread.sleep(15000);
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    break;
                }
                writeSse(output, ": ping\n\n");
            }
        } catch (IOException ignored) {
            // Normal when the browser closes/reconnects its EventSource.
        } finally {
            sseClients.remove(output);
            try {
                output.close();
            } catch (IOException ignored) {
                // Already closed by the peer or server shutdown.
            }
        }
    }

    private final DomainObjectListener changeListener = new DomainObjectListener() {
        @Override
        public void domainObjectChanged(DomainObjectChangedEvent event) {
            boolean emittedSpecificEvent = false;
            for (DomainObjectChangeRecord record : event) {
                if (!(record instanceof ProgramChangeRecord)) {
                    continue;
                }
                ProgramChangeRecord programRecord = (ProgramChangeRecord) record;
                if (programRecord.getEventType() == ChangeManager.DOCR_SYMBOL_RENAMED) {
                    broadcastSymbolRename(programRecord);
                    emittedSpecificEvent = true;
                } else if (isSymbolChange(programRecord)) {
                    broadcastSymbolChange(programRecord);
                    emittedSpecificEvent = true;
                }
            }
            if (!emittedSpecificEvent) {
                broadcast(baseEvent("programChanged"));
            }
        }
    };

    private static boolean isSymbolChange(ProgramChangeRecord record) {
        return record.getEventType() == ChangeManager.DOCR_SYMBOL_ADDED
                || record.getEventType() == ChangeManager.DOCR_SYMBOL_REMOVED
                || record.getEventType() == ChangeManager.DOCR_SYMBOL_SOURCE_CHANGED
                || record.getEventType() == ChangeManager.DOCR_SYMBOL_SET_AS_PRIMARY
                || record.getEventType() == ChangeManager.DOCR_SYMBOL_SCOPE_CHANGED
                || record.getEventType() == ChangeManager.DOCR_SYMBOL_DATA_CHANGED
                || record.getEventType() == ChangeManager.DOCR_SYMBOL_ADDRESS_CHANGED;
    }

    private void broadcastSymbolRename(ProgramChangeRecord record) {
        Symbol symbol = symbolFrom(record);
        Address address = symbol == null ? record.getStart() : symbol.getAddress();
        if (address == null) {
            return;
        }
        Map<String, Object> out = baseEvent("symbolRenamed");
        out.put("address", addressText(address));
        out.put("oldName", symbolName(record.getOldValue()));
        out.put("newName", symbol == null ? symbolName(record.getNewValue()) : symbol.getName(true));
        out.put("source", symbol == null ? "DEFAULT" : symbol.getSource().name());
        broadcast(out);
    }

    private void broadcastSymbolChange(ProgramChangeRecord record) {
        Symbol symbol = symbolFrom(record);
        Address address = symbol == null ? record.getStart() : symbol.getAddress();
        if (address == null) {
            return;
        }
        Map<String, Object> out = baseEvent("symbolChanged");
        out.put("address", addressText(address));
        if (symbol != null) {
            out.put("name", symbol.getName(true));
            out.put("source", symbol.getSource().name());
        }
        broadcast(out);
    }

    private static Symbol symbolFrom(ProgramChangeRecord record) {
        if (record.getObject() instanceof Symbol) {
            return (Symbol) record.getObject();
        }
        if (record.getNewValue() instanceof Symbol) {
            return (Symbol) record.getNewValue();
        }
        if (record.getOldValue() instanceof Symbol) {
            return (Symbol) record.getOldValue();
        }
        return null;
    }

    private static String symbolName(Object value) {
        if (value instanceof Symbol) {
            return ((Symbol) value).getName(true);
        }
        return value == null ? null : String.valueOf(value);
    }

    private Map<String, Object> baseEvent(String type) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("type", type);
        out.put("ts", System.currentTimeMillis());
        return out;
    }

    private void writeSse(OutputStream output, String line) throws IOException {
        // broadcast() ghi cùng OutputStream này từ Swing thread (domainObjectChanged).
        // Hai luồng write+flush xen kẽ nhau sẽ làm frame SSE lẫn lộn -> client mất
        // sự kiện rename mà không báo lỗi. Chốt trên chính stream là đủ.
        synchronized (output) {
            output.write(line.getBytes(StandardCharsets.UTF_8));
            output.flush();
        }
    }

    private void broadcast(Map<String, Object> event) {
        byte[] bytes = ("data: " + Json.encode(event) + "\n\n").getBytes(StandardCharsets.UTF_8);
        for (OutputStream output : sseClients) {
            try {
                synchronized (output) {        // xem writeSse(): cùng stream, khác luồng
                    output.write(bytes);
                    output.flush();
                }
            } catch (IOException disconnected) {
                sseClients.remove(output);
                try {
                    output.close();
                } catch (IOException ignored) {
                    // Nothing left to clean up.
                }
            }
        }
    }

    private static final Map<String, String> MIME = new ConcurrentHashMap<>();
    static {
        MIME.put(".html", "text/html; charset=utf-8");
        MIME.put(".js", "application/javascript; charset=utf-8");
        MIME.put(".css", "text/css; charset=utf-8");
        MIME.put(".png", "image/png");
        MIME.put(".svg", "image/svg+xml");
        MIME.put(".json", "application/json; charset=utf-8");
    }

    private void serveStatic(HttpExchange exchange, String requestPath) throws IOException {
        if (toolDir.isEmpty()) {
            sendText(exchange, 200,
                    "<h3>PCODE Grapher bridge is running</h3>"
                    + "<p>Open PCODE Grapher and connect to <code>http://127.0.0.1:" + port + "/</code>.</p>",
                    "text/html; charset=utf-8");
            return;
        }
        try {
            Path root = Paths.get(toolDir).toRealPath();
            String relative = (requestPath.equals("/") || requestPath.isEmpty())
                    ? "index.html" : requestPath.substring(1);
            Path file = root.resolve(relative).normalize();
            if (!file.startsWith(root) || !Files.isRegularFile(file)) {
                sendText(exchange, 404, "not found");
                return;
            }
            // Resolve symlinks before serving so a symlink cannot escape Tool Dir.
            Path realFile = file.toRealPath();
            if (!realFile.startsWith(root)) {
                sendText(exchange, 403, "forbidden path");
                return;
            }
            byte[] body = Files.readAllBytes(realFile);
            exchange.getResponseHeaders().set("Content-Type", MIME.getOrDefault(ext(relative),
                    "application/octet-stream"));
            exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
            // U6: file trong assets/ có TÊN HASH (mỗi build tên khác) → cache vĩnh viễn
            // an toàn. index.html + file không-hash → no-cache: sau `npm run build`
            // user chỉ cần F5 là thấy bản mới (trước đây browser tái dùng index.html
            // + bundle CŨ từ HTTP cache → "Ghidra chạy bản cũ" dù đĩa đã có bản mới).
            exchange.getResponseHeaders().set("Cache-Control",
                    relative.startsWith("assets/")
                            ? "public, max-age=31536000, immutable"
                            : "no-cache, must-revalidate");
            exchange.sendResponseHeaders(200, body.length);
            try (OutputStream output = exchange.getResponseBody()) {
                output.write(body);
            }
        } catch (Exception invalidToolDir) {
            sendJson(exchange, 500, err("invalid Tool Dir: " + invalidToolDir.getMessage()));
        }
    }

    private static String ext(String path) {
        int index = path.lastIndexOf('.');
        return index < 0 ? "" : path.substring(index).toLowerCase();
    }

    private static int parseInt(String value, int fallback) {
        try {
            return Integer.parseInt(value);
        } catch (Exception ignored) {
            return fallback;
        }
    }

    private static String trimToEmpty(String value) {
        return value == null ? "" : value.trim();
    }

    private static Map<String, String> parseQuery(String rawQuery) {
        Map<String, String> query = new LinkedHashMap<>();
        if (rawQuery == null || rawQuery.isEmpty()) {
            return query;
        }
        for (String part : rawQuery.split("&")) {
            int at = part.indexOf('=');
            String key = at < 0 ? part : part.substring(0, at);
            String value = at < 0 ? "" : part.substring(at + 1);
            query.put(URLDecoder.decode(key, StandardCharsets.UTF_8),
                    URLDecoder.decode(value, StandardCharsets.UTF_8));
        }
        return query;
    }

    private static void cors(HttpExchange exchange) {
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, OPTIONS");
        exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type, X-Bridge-Token");
        // Private Network Access: từ Chrome 130+ / Edge 143+ (Firefox chưa), một trang
        // web KHÔNG phải loopback (vd mở tool qua URL preview / http từ Tool Dir khác
        // host) gọi xuống bridge 127.0.0.1 bị chặn NGAY TỪ PREFLIGHT nếu thiếu header
        // này. Chỉ trả khi client hỏi, theo đúng đặc tả.
        if ("true".equalsIgnoreCase(exchange.getRequestHeaders().getFirst("Access-Control-Request-Private-Network"))) {
            exchange.getResponseHeaders().set("Access-Control-Allow-Private-Network", "true");
        }
    }

    private void sendJson(HttpExchange exchange, int status, Object value) throws IOException {
        byte[] body = Json.encode(value).getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
        exchange.sendResponseHeaders(status, body.length);
        try (OutputStream output = exchange.getResponseBody()) {
            output.write(body);
        }
    }

    private void sendText(HttpExchange exchange, int status, String text) throws IOException {
        sendText(exchange, status, text, "text/plain; charset=utf-8");
    }

    private void sendText(HttpExchange exchange, int status, String text, String contentType) throws IOException {
        byte[] body = text.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", contentType);
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.sendResponseHeaders(status, body.length);
        try (OutputStream output = exchange.getResponseBody()) {
            output.write(body);
        }
    }

    private static Map<String, Object> err(String message) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("error", message);
        return out;
    }

    private static Map<String, Object> nameOnly(String name) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("name", name);
        return out;
    }
}
