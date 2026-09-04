# Nhật ký sửa lỗi

## 1.8.2 — Map biến cục bộ vào symbols (2026-09-03)

**Plugin-side (Java, cần build lại extension):** **rename BIẾN CỤC BỘ trong Ghidra không đồng bộ live sang tool.**
- **Nguyên nhân**: `walkMarkup` tra symbol theo địa chỉ code qua `symbolTable.getPrimarySymbol()`
  — bảng symbol CHƯƠNG TRÌNH chỉ có hàm/nhãn/biến toàn-cục. Biến cục bộ & tham số (HighSymbol,
  địa chỉ stack) không bao giờ được map vào `symbols` của `/api/decompile` → SSE `symbolRenamed`
  của local var mang địa chỉ lạ → tool không biết token nào cần đổi tên ("phải F5 mới thấy").
- **Fix**: với `ClangVariableToken`, nếu tra bảng symbol không ra thì lấy
  `tokenNode.getHighSymbol().getSymbol()` (địa chỉ stack) — map `text → {addr, name}` cho
  local var/param. `/api/resolve` chưa đổi (chỉ dùng cho symbol toàn-cục).
- **Lưu ý**: tool-side đã có fallback riêng (re-decompile hàm đang xem khi nhận rename địa chỉ
  lạ) nên bản plugin cũ 1.8.0 vẫn đồng bộ live — bản Java này chỉ giúp local rename đi đường
  nhẹ (đổi tên hiển thị, không cần decompile lại).

## 1.8.1 — Cache-Control cho file tĩnh (2026-09-02)

**Plugin-side (Java, cần build lại extension):** **"rebuild tool xong mà tab bridge vẫn chạy bản cũ".**
- **Nguyên nhân**: `serveStatic` không gắn `Cache-Control` — browser tái dùng `index.html` + bundle
  cũ từ HTTP cache (bridge đọc file từ đĩa lại MỖI request, Ghidra không giữ bản cũ; URL token mới
  sau Restart hoặc Ctrl+Shift+R bypass cache nên tưởng "Ghidra cần restart mới update").
- **Fix**: gắn header — file trong `assets/` (tên có hash, mỗi build đổi tên) →
  `Cache-Control: public, max-age=31536000, immutable`; `index.html` + file còn lại →
  `Cache-Control: no-cache, must-revalidate`. Sau `npm run build` chỉ cần **F5** là thấy bản mới.

## 1.8.0 — Đồng bộ hàm 2 chiều Ghidra ⇄ Tool (2026-08-29)

**Tool-side (JS, không cần build Java):** **SỬA LEAK BỘ NHỚ khi tắt Ghidra (tab ăn 10 GB).**
- **Triệu chứng**: khi người dùng tắt Ghidra giữa chừng (bridge chết đột ngột), tab tool phình
  bộ nhớ rất lớn.
- **Root cause** (`js/ui/ghidra.js` `ghidraStartEvents()`): (1) không clear `GHDR._hb` cũ trước khi
  tạo `setInterval` mới; (2) heartbeat (stream zombie >40s không ping) tự gọi lại chính hàm này;
  (3) guard `session!==session` clear `GHDR._hb` (cái mới) thay vì clear interval của chính nó.
  Kết hợp lại: mỗi chu kỳ heartbeat tạo thêm một `setInterval`, còn cái cũ giữ nguyên → số heartbeat
  **nhân đôi mỗi ~30s**, bùng lên hàng trăm nghìn → leak bộ nhớ.
- **Fix**: clear `_hb` cũ ở đầu hàm; dùng biến cục bộ `hb` + `clearInterval(hb)` (guard đúng chính
  nó); gán `GHDR._hb = hb` cuối hàm.
- **Tái hiện** bằng mô phỏng đúng logic: trước fix **1,173,842** interval còn sống sau ~2s (LEAK);
  sau fix **1** (ổn định). `node --check` OK; regression + smoke + sync tests PASS.

**Tool-side (JS, không cần build Java):** **sửa text bị nhòe khi zoom (độ phân giải thấp)**.
- **Nguyên nhân**: `_tf()` đặt `translate3d(...) scale(...)` trên cùng một `#stage` có
  `will-change:transform` → toàn đồ thị nằm trên một **GPU texture** được rasterize ở một độ phân
  giải cố định; khi zoom, trình duyệt **phóng/thu texture** thay vì vẽ lại chữ ⇒ chữ nhòe (blurry,
  cảm giác "độ phân giải thấp").
- **Fix (2 lớp transform)**: `#stage` giữ **translate** (pan — GPU layer mượt, chỉ DỊCH texture nên
  không nhòe), còn `#zoom` (wrapper mới bọc `#edges`+`#nodes`) chỉ **scale** (zoom — **không** có
  `will-change`, nên khi đổi scale trình duyệt **vẽ lại** nội dung theo DPR hiện tại ⇒ nét).
  Thêm ghi chú CSS tại `#stage`/`#zoom` để model sau hiểu.
- **Kèm**: giảm `stroke-width` nhãn edge `.elbl` `3px → 1.5px` (outline quá dày cho chữ 10px làm
  chữ béo/nhòe), và đồng bộ mức đó trong `js/ui/exporter.js` (EXPORT_CSS).

**Tool-side (JS, không cần build Java):** **bỏ auto-hover làm mờ** + sửa 2 lỗi **logic làm mờ
(dim/focus)** mà người dùng thấy khó chịu — đều **tái lập/kiểm chứng bằng test jsdom thật**:

- 🚫 **Tắt auto-hover (làm mờ khi di chuột).** Trước đây `initHover()` đăng ký `pointerover/pointerout`
  trên `#nodes`: cứ lướt chuột vào bất kỳ block nào là gọi `hoverNode(nid)` → thêm `#board.nhover`
  → toàn bộ phần còn lại mờ xuống 45%. Người dùng chỉ cần di chuyển con chuột qua một block là cả
  graph chìm đi, gây khó chịu. Đã xoá hai listener này: **di chuột không còn làm mờ gì cả**. Mờ/focus
  giờ chỉ xảy ra khi **chủ động**: click edge (`focusEdge`) hoặc click ghim node (`togglePinFocus`).

- 🐛 **Sửa 2 lỗi logic làm mờ (dim/focus)** mà còn lại (đã tái lập được):
- **Bug A — hover rồi rời đi làm mất vĩnh viễn dim của search.** Trước đây `hoverNode(null)`
  (khi pointer rời node) chỉ xoá `nhover` và class focus nhưng **không khôi phục `dimmed`**.
  Kết quả: sau khi người dùng hover qua bất kỳ block nào rồi rời đi, hiệu ứng làm mờ của search
  highlight biến mất hoàn toàn cho tới khi gõ lại từ khoá. → Thêm `restoreDimAfterHover()`
  khôi phục `dimmed` dựa trên sự hiện diện của node `.lit` (dùng `.lit`, không dùng `hlKeys.size`,
  vì nếu search không khớp nào thì không có `.lit`/`dimmed` → khồng được khôi phục sai).
- **Bug B — rebuild (đổi preset/hướng/nguồn) để board mờ nhưng không còn node `.lit`.**
  `renderGraph()` dựng lại toàn bộ node (DOM mới, `.lit`/`.on` mất trong khi `#board.dimmed` giữ
  nguyên) → cả đồ thị chìm ở độ mờ 45% mà không có highlight, rất khó chịu. → Sau mỗi lượt render
  (renderGraph + fallbackLayout), nếu còn `hlKeys` thì gọi `applyHighlights()` để đánh dấu lại,
  ngược lại gọi `restoreDimAfterHover()` để dọn `dimmed` thừa.

**Tính năng mới — hai chiều**: grapher và CodeBrowser giờ đồng bộ hàm với nhau.

- 🖱️ **Ghidra → Tool**: Click phải lên hàm trong CodeBrowser **Listing hoặc cửa sổ Decompiler**
  → menu **PCODE Grapher → Đồng bộ hàm tới PCODE Grapher** (hoặc phím tắt **Ctrl+Shift+G**).
  Plugin tìm hàm tại vị trí con trỏ (`FunctionManager.getFunctionContaining` / `getFunctionAt`
  cho Listing, `DecompilerActionContext.getFunction()`/`hasRealFunction()` cho Decompiler) và
  phát **SSE `syncFunction`** `{address, name, program}`. Tool nhận event này trong
  `ghidraHandleEvent` → `ghidraOpenFunction(address)` → decompile & vẽ đúng hàm đó.
  *(Sửa: trước đây mục popup chỉ nhận `ListingActionContext` nên click trong Decompiler không
  hoạt động — đã bổ sung `DecompilerActionContext`.)*
- ⇄ **Tool → Ghidra**: nút **⇄ Đồng bộ** (panel GHIDRA LIVE) gọi `GET /api/goto?address=<entry>`;
  plugin chạy `GoToService` trên Swing thread (`SystemUtilities.runSwingNow(() -> goTo(addr))`)
  để nhảy con trỏ CodeBrowser tới hàm đang xem. `GET /api/goto` là read-only (không sửa metadata).
- ⌨️ Phím tắt mặc định **Ctrl+Shift+G**; đổi trong `Edit → Tool Options → Key Bindings`
  (hoặc F4 trên mục menu). 
- 📡 `/events` giờ còn phát `syncFunction`; `/api/health` không đổi.
- 🔁 **Sửa**: bridge trả về **bản decompile khác** với cửa sổ Ghidra (vd `_DAT_... = buf[0x10]`
  vs `_DAT_... = 7602277`, số hex vs thập phân). Nguyên nhân: `PcodeGrapherPlugin` mở
  `DecompInterface` riêng với **option mặc định**, không dùng option của tool. Đã vá bằng
  `decomp.setOptions(DecompilerUtils.getDecompileOptions(tool, program))` (chính là helper
  `CreateStructureVariableAction` dùng) trước `openProgram` → C trả về khớp cửa sổ Ghidra.
- 🧪 Mở rộng contract trong `tests/mock_bridge.js` + thêm 2 test sau:
  - `node tests/sync-live.js`  — contract HTTP/SSE không cần browser (chạy được ở đây).
  - `node tests/sync-jsdom.js` — chạy UI tool-side thật trên jsdom để kiểm chứng cả hai chiều.
- Cả hai test trên **ĐỀU PASS** trong môi trường này (không cần Ghidra/browser thật).

⚠ Ràng buộc kiểm chứng: phần **Java** chưa compile/load được trong môi trường này
(không có Ghidra 12.1.3 + JDK 21, không có root để cài libs trình duyệt). Đã rà soát từng
API mới dùng theo tài liệu chính thống Ghidra (xem `ghidra-plugin/README.md`); cần chạy
`gradlew buildExtension` bằng Ghidra 12.1.3 thật và `npm run test:ghidra-live` trước khi phát hành.

## 1.7.0 — bảo mật mặc định + sửa SSE/pool (2026-08-28)

**Breaking (mặc định)**: `Require Token` giờ **bật sẵn**. Bridge mở `Access-Control-Allow-Origin: *`
mà không có token nghĩa là mọi trang web trong Firefox/Safari (nơi chưa enforce Private Network
Access) đọc được pseudocode binary đang mở; Chrome/Edge chặn hộ từ 130+/143+ nhưng đó không phải
biên giới bảo mật. Ai muốn tắt phải tự vào Tool Options.

- 🧹 **Xoá artifact dẫn xuất khỏi repo**: `lib/PcodeGrapherBridge.jar`, `lib/PcodeGrapherBridge-src.zip`,
  `dist/*.zip`, `build/` — tất cả đều **cũ hơn `src/`** và `build-zip.bat` sinh lại
  được. `pom.xml` + `src/assembly/ghidra-extension.xml` cũng bị xoá vì `mvn package` đòi tự copy
  9 JAR đúng phiên bản vào `lib/` (không bao giờ chạy được nguyên trạng); đường build là Gradle.
- 🔒 Mặc định yêu cầu token; Console in URL kèm `?token=` như cũ.
- 🌐 Preflight `OPTIONS` trả `Access-Control-Allow-Private-Network: true` khi client hỏi
  → mở UI từ origin không-loopback (preview/proxy) hết bị Chrome chặn trước khi tới server.
- 🧵 `HttpServer` dùng cached thread pool + trần 24 EventSource. Trước đó pool fixed(8) và
  mỗi `/events` giữ một thread suốt đời → **8 tab mở là mọi `/api/*` xếp hàng chờ vô hạn**.
- 📡 `writeSse`/`broadcast` ghi cùng một `OutputStream` được `synchronized(output)` → hết cảnh
  frame SSE xen kẽ nát khi rename xảy ra đúng lúc ping.
- ⚡ `sendJson` ra ngoài `decompLock`: một client chậm không còn chặn mọi decompile khác.
- 📋 `/api/functions` thêm `hasMore` + `limit`; UI báo rõ khi danh sách bị cắt ở 500 hàm.
- 🧩 Client (`js/ui/ghidra.js`) gửi thêm header `X-Bridge-Token`; EventSource có watchdog
  (im lặng >40s = stream zombie → đóng/mở lại) và **resync symbol qua `/api/resolve`** sau khi
  đứt, vì server không replay sự kiện.
- 🐍 `ghidra/PcodeGrapherBridge.py` (legacy): sửa `ChangeManager` sai package, dùng tên event
  `DOCR_SYMBOL_*` thật (trước đây `EVENT_SYMBOL_*` không tồn tại → rename không bao giờ phát),
  listener kế thừa `DomainObjectListener`, token bật mặc định. Header ghi rõ đây là bản legacy.
- 📦 `lib/PcodeGrapherBridge-src.zip` dựng lại từ source hiện tại; `lib/*.jar` vẫn là artifact
  cũ (xem `lib/README-STALE-JAR.txt`) — build lại bằng `build-zip.bat`/`gradlew buildExtension`.
- 🛠 `build.gradle` thêm `options.encoding = 'UTF-8'` (comment tiếng Việt làm javac chết với
  default charset khác UTF-8), version đồng bộ 1.7.0 ở extension.properties/pom/Java/scripts.

⚠ Chưa kiểm chứng bằng Ghidra thật trong môi trường sửa lỗi này: plugin **parse** hợp lệ
(`javalang` + `javac -encoding UTF-8` chỉ còn lỗi "package ghidra.* does not exist", 0 lỗi cú pháp),
nhưng chưa chạy `buildExtension`/`Ghidra --analyzeHeadless`. Cần chạy `npm run test:ghidra-live`
với Ghidra 12.1.3 + JDK 21 trước khi phát hành.

## v1.6.2 — Kiểm tra và sinh token không mơ hồ

- Đã kiểm tra source trong ZIP build: token chỉ được sinh khi `Require Token=true`; khi false, source cố ý đặt `token=null`, nên Console không có `?token=`.
- Console giờ in rõ state `Require Token=false; token is disabled` hoặc state configured/generated token.
- Thêm menu một-click **Tools → PCODE Grapher Bridge → Generate token and restart**: bật Require Token, sinh token mới và in URL/token vào Console.
- Web UI hiển thị `needsToken` từ `/api/health`, giải thích chính xác tại chỗ tại sao Console có/không có token.

## v1.6.1 — Sửa đường chạy web tool / `Failed to fetch`

- UI chẩn đoán rõ lỗi network thay vì chỉ báo `Failed to fetch`; chỉ ra khi tool đang chạy ở preview/host khác nên `127.0.0.1` không phải máy Ghidra.
- Thêm **Tool Dir same-origin mode**: health báo `servesTool/toolUrl`, UI hiện link **Mở tool qua bridge**, trang hosted tự lấy bootstrap token và tự kết nối.
- Static HTML/CSS/JS được phép tải trên loopback khi token bật; chỉ `/api/*` và `/events` đòi token. Điều này sửa lỗi tài nguyên static bị 401 vì query `?token=` không được kế thừa qua thẻ `<script src>`.
- Chuẩn hoá `localhost` thành `127.0.0.1` để tránh Windows ưu tiên IPv6 `::1` trong khi bridge bind IPv4.

## v1.6.0 — Hoàn thiện Ghidra Live end-to-end

- **SSE rename thật:** Java plugin giờ duyệt `DomainObjectChangedEvent`/`ProgramChangeRecord` và phát `symbolRenamed` với địa chỉ, tên cũ/mới, source. Trước đó listener chỉ phát `programChanged`, nên UI không thể cập nhật token rename live dù mock làm được.
- Thêm event `symbolChanged`, `programActivated`, `programDeactivated`; UI tự làm mới function list khi đổi/mở program.
- UI hỗ trợ dán nguyên URL console dạng `http://127.0.0.1:8765/?token=...`, tự tách token; thêm nút **Ngắt**, xử lý HTTP/API lỗi và ngăn async response cũ ghi đè phiên kết nối mới.
- Sửa restart server: đọc lại `Port`, `Require Token`, `Token`, `Tool Dir`; dừng SSE/socket/executor cũ để không leak thread sau nhiều lần restart.
- Sửa whitelist Host cho IPv6 `::1`, parse địa chỉ bằng `AddressFactory`, static-file serving chống path/symlink traversal.
- Gradle không còn hard-code đường dẫn máy cá nhân; yêu cầu `GHIDRA_INSTALL_DIR`. Maven fallback cũng đóng gói đúng `Module.manifest`, `extension.properties`, `PcodeGrapherBridge.jar`.
- Thêm browser integration test `npm run test:ghidra-live`: token URL → health/functions → decompile/overlay → SSE rename → disconnect.


## v1.5.1 — Sửa plugin KHÔNG NẠP được trong Ghidra

### Triệu chứng
Plugin cài vào Ghidra 12.1.3 nhưng:
- Không thấy `PcodeGrapherBridge` trong `File → Configure`,
- Console không in dòng `PCODE Grapher bridge: http://127.0.0.1:8765/`,
- Tool web không kết nối được (bridge không chạy).

### Nguyên nhân gốc rễ
Class `PcodeGrapherPlugin` **thiếu annotation `@PluginInfo(...)`**. Ghidra **bắt buộc**
mọi plugin có `@PluginInfo` (theo tài liệu chính thức `ghidra.framework.plugintool.Plugin`
— "All Plugins must be tagged with a `@PluginInfo(...)` annotation") để nhận diện và nạp.
→ Plugin không được đăng ký → không nạp → HTTP server trong constructor không khởi động.

### Nguyên nhân phụ (sẽ hỏng tiếp nếu chỉ thêm `@PluginInfo`)
`PcodeGrapherPlugin` kế thừa `Plugin` trần rồi tự bắt `ProgramActivatedPluginEvent` qua
`processEvent(...)`, nhưng một plugin chỉ nhận event nếu khai báo `eventsConsumed` →
`currentProgram` mãi `null` → decompile luôn báo "no program".

### Đã sửa
1. **Thêm `@PluginInfo`** (bắt buộc):
   ```java
   @PluginInfo(
       status = PluginStatus.RELEASED,
       packageName = DeveloperPluginPackage.NAME,
       category = PluginCategoryNames.ANALYSIS,
       shortDescription = "PCODE Grapher HTTP bridge",
       description = "..."
   )
   ```
2. **Đổi `extends Plugin` → `extends ProgramPlugin`**: Ghidra tự track `currentProgram`
   và tự gọi `programActivated/programDeactivated` (qua `internalRegisterEventConsumed`).
   Xóa hàm `processEvent` tự viết. (Kiểu này giống GhidraMCP và template chính thức Ghidra.)
3. Đổi field `currentProgram` → `volatile Program activeProgram` (an toàn cho nhiều thread HTTP).
4. Dọn file lạc `src/assembly/extension.xml` (không được build include, cũng không cần —
   Ghidra discover plugin qua `@PluginInfo` + `ClassSearcher`, không qua `data/extension.xml`).

### Kiểm tra API với Ghidra 12.1.3
| API dùng | Trạng thái |
|---|---|
| `ghidra.app.plugin.ProgramPlugin` + `programActivated/programDeactivated` | ✅ có (verified docs + source Ghidra) |
| `@PluginInfo` (`status`, `packageName`, `category`, `shortDescription`, `description`) | ✅ đúng chữ ký |
| `DeveloperPluginPackage.NAME` | ✅ có thật (GhidraMCP cũng dùng) |
| `PluginCategoryNames.ANALYSIS` | ✅ có; lưu ý: **KHÔNG có** `MISC` |
| `MiscPluginPackage` | ❌ không tồn tại (chỉ có Core/Developer/Examples) — nên KHÔNG dùng |
| `DecompInterface`, `ClangNode`, `getGlobalSymbols`, `getCCodeMarkup`... | ✅ giữ nguyên từ bản gốc (đã build OK) |

> Bản gốc (v1.5.0) **biên dịch được** nhưng **không nạp** được — vì thiếu `@PluginInfo`
> là lỗi runtime (Ghidra không discover), không phải lỗi compile.

### Build & cài
1. Chỉnh biến `GHIDRA` trong `build.bat` / `build.ps1` (hoặc `set GHIDRA=...`) trỏ tới
   thư mục `ghidra_12.1.3_PUBLIC` của bạn.
2. Chạy `build.bat` (Windows) hoặc `pwsh build.ps1`. Cần JDK 21 (`javac`, `jar`).
3. Cài `target\pcode-grapher-bridge-1.5.1.zip` qua `Ghidra → File → Install Extensions`.
4. Restart Ghidra → CodeBrowser → `File → Configure → Developer` → bật **PcodeGrapherBridge**.
   (Lưu ý: nhóm là **Developer**, không phải Miscellaneous — vì dùng `DeveloperPluginPackage`.)
5. Console in `PCODE Grapher bridge: http://127.0.0.1:8765/` → dán vào ô GHIDRA LIVE của tool.

## v1.5.2 — Sửa lỗi plugin KHÔNG nạp được (tìm thấy từ mã nguồn Ghidra 12.1.3)

Nguyên nhân gốc (2 bug, đã tải Ghidra 12.1.3 thật về kiểm chứng):

1. **`extension.properties` + `Module.manifest` phải nằm ở GỐC project**
   (cạnh `build.gradle`), KHÔNG trong `src/main/resources/`.
   Lý do: `buildExtension.gradle` của Ghidra đọc chúng từ gốc project:
   `new File(project.projectDir, "extension.properties")` và
   `from(project.projectDir){exclude src/**}`. Để trong `src/main/resources/`
   thì build Gradle không đưa chúng lên gốc extension → Ghidra không nhận diện.

2. **Tên file jar PHẢI bắt đầu bằng TÊN MODULE** (tên thư mục extension).
   Lý do: `ClassJar.isModuleDependencyJar()` chỉ quét jar khi
   `jarName.startsWith(moduleName)`. Bản build.bat cũ đặt jar là
   `pcode-grapher-bridge.jar` trong khi module là `PcodeGrapherBridge` →
   **không khớp → ClassSearcher BỎ QUA jar → plugin không hiện**.
   → Đổi tên jar thành `PcodeGrapherBridge.jar` (đã sửa trong build.bat/ps1).
   Gradle tự đặt đúng tên (jar = project.name = `PcodeGrapherBridge`).

Kết quả cấu trúc extension đúng (giống GhidraMCP / Skeleton):
```
PcodeGrapherBridge/
  extension.properties
  Module.manifest
  lib/PcodeGrapherBridge.jar
```
