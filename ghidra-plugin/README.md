# PCODE Grapher — Ghidra Live Bridge

> **Mặc định từ 1.7.0:** `Require Token = true`. Lần chạy đầu Console in
> `http://127.0.0.1:8765/?token=<24 ký tự>` — dán **cả URL** vào panel GHIDRA LIVE.
> Tắt token chỉ nên làm khi máy không có mạng.
>
> **Repo không còn kèm artifact dẫn xuất** (từ 1.7.0): `lib/*.jar`, `lib/*-src.zip`, `dist/*.zip`
và `ghidra-plugin/build/` đều là output — đã xoá vì chúng **cũ hơn source** và dễ làm người dùng
cài nhầm bản cũ. Hãy build lại bằng `build-zip.bat` (Gradle Wrapper đã kèm sẵn).


Extension Java chạy **trong CodeBrowser** để PCODE Grapher có thể duyệt hàm, lấy C decompile, hiện symbol do người dùng đặt tên và nhận rename qua **SSE**. Bridge chỉ bind `127.0.0.1`; API chỉ đọc dữ liệu Ghidra.

## Yêu cầu

- **Ghidra 12.1.3**
- **JDK 21** (đúng JDK mà Ghidra 12.1.3 dùng)
- Không cần Maven hoặc Gradle cài toàn cục — đã có Gradle Wrapper.

> Luôn build extension với **chính thư mục Ghidra sẽ cài extension**. Gradle lấy API/classpath trực tiếp từ đó.

## Build và cài extension

### Windows

Mở `cmd.exe` trong thư mục `ghidra-plugin`:

```bat
set "GHIDRA_INSTALL_DIR=C:\tools\ghidra_12.1.3_PUBLIC"
build-zip.bat
```

### Linux / macOS

```bash
cd ghidra-plugin
export GHIDRA_INSTALL_DIR=/opt/ghidra_12.1.3_PUBLIC
chmod +x gradlew
./gradlew clean buildExtension
```

ZIP nằm trong `dist/`, dạng:

```text
ghidra_12.1.3_PUBLIC_YYYYMMDD_PcodeGrapherBridge.zip
```

Trong **Ghidra Project Manager**: `File → Install Extensions → +` → chọn ZIP → restart Ghidra. Sau restart, mở một binary trong **CodeBrowser**, vào:

```text
File → Configure → Developer → PCODE Grapher HTTP bridge
```

và bật plugin. Console sẽ in, ví dụ:

```text
PCODE Grapher bridge: http://127.0.0.1:8765/?token=...
```

## Kết nối từ PCODE Grapher

1. Mở `pcode-grapher/index.html` (hoặc bản standalone) trong Chrome/Edge/Firefox.
2. Trong **GHIDRA LIVE**, dán **toàn bộ URL** console in ra. Nếu URL có `?token=…`, giao diện tự tách token vào ô Token.
3. Bấm **Kết nối**, chọn hàm trong danh sách. Tool lấy pseudocode, dựng CFG và overlay các symbol live.
4. Đổi tên function/data/label trong Ghidra: token tương ứng trong graph đổi ngay qua SSE, không cần build lại graph.

Nếu bridge chạy nhưng chưa mở binary, UI báo *chưa có program active* và tự nạp danh sách khi bạn mở/chuyển program trong CodeBrowser.

## Tool Options và restart server

Trong CodeBrowser, mở `Edit → Tool Options → PCODE Grapher`:

| Option | Ý nghĩa |
|---|---|
| `Port` | Port loopback, mặc định `8765` |
| `Require Token` | Bắt buộc token với API + SSE |
| `Token` | Token cố định; để trống thì bridge tạo token ngẫu nhiên khi khởi động |
| `Tool Dir` | Tùy chọn: thư mục chứa `index.html`; để trống là API-only |

Sau khi đổi option, chọn `Tools → PCODE Grapher Bridge → Restart server`. Bản v1.6.2 đọc lại option khi restart (cả port, token và Tool Dir).

Nếu muốn token ngay mà không phải tìm Tool Options, dùng menu:

```text
Tools → PCODE Grapher Bridge → Generate token and restart
```

Nút này đặt `Require Token=true`, xóa token cũ để sinh token mới, restart bridge và in token vào Console. Khi token đang tắt, Console cũng in rõ `Require Token=false; token is disabled` thay vì chỉ in URL không có token.

### Nếu web tool báo `Failed to fetch`

Đây là lỗi trình duyệt không chạm được `127.0.0.1`, thường vì tool đang mở trong preview/web host khác thay vì browser trên cùng máy Windows với Ghidra. Cách ổn định nhất là chạy tool **cùng origin** với bridge:

1. Giải nén project và đặt `Tool Dir` thành thư mục có `index.html`, ví dụ:
   ```text
   D:\\tools\\pcode-grapher\\pcode-grapher
   ```
2. Chọn `Tools → PCODE Grapher Bridge → Restart server`.
3. Mở trực tiếp `http://127.0.0.1:8765/` trong Chrome/Edge trên **chính máy chạy Ghidra**. Nếu token bật, dùng nguyên URL có `?token=...` từ Console.

Bản hosted tự dùng request same-origin; khi token bật, CSS/JS vẫn tải được còn `/api/*` và `/events` vẫn yêu cầu token. Cũng có thể mở `index.html` trực tiếp bằng `file://` trên cùng máy và dùng URL `http://127.0.0.1:8765`; không dùng preview chạy trên máy/host khác.

## Update nhanh khi sửa Java

```bat
set "GHIDRA_INSTALL_DIR=C:\tools\ghidra_12.1.3_PUBLIC"
build.bat
```

`build.bat` chỉ build JAR rồi copy vào extension đã cài. Nếu profile Ghidra của bạn có tên thư mục khác, đặt thêm `GHIDRA_EXTENSIONS_DIR` trỏ tới thư mục `Extensions`. Restart Ghidra sau khi copy.

## Đồng bộ hàm 2 chiều (v1.8.0)

Grapher và CodeBrowser giờ **đồng bộ hàm** với nhau:

- **Ghidra → Tool**: click phải lên hàm trong **CodeBrowser Listing** **hoặc cửa sổ Decompiler**
  → menu **PCODE Grapher → Đồng bộ hàm tới PCODE Grapher** (hoặc phím tắt **Ctrl+Shift+G**).
  Plugin tìm hàm tại con trỏ (`FunctionManager.getFunctionContaining`/`getFunctionAt` cho
  Listing, `DecompilerActionContext.getFunction()`/`hasRealFunction()` cho Decompiler) và
  phát SSE `syncFunction` `{address, name, program}`; tool nhận trong `ghidraHandleEvent`
  → tự decompile & vẽ hàm đó.
- **Tool → Ghidra**: nút **⇄ Đồng bộ** trong panel GHIDRA LIVE gọi
  `GET /api/goto?address=<entry>`; plugin chạy `GoToService` trên Swing thread
  (`SystemUtilities.runSwingNow(() -> goTo(addr))`) → CodeBrowser nhảy tới hàm đang xem.
  Endpoint này **không sửa metadata**, chỉ di chuyển con trỏ.
- Phím tắt mặc định `Ctrl+Shift+G`; đổi trong `Edit → Tool Options → Key Bindings`
  (hoặc nhấn F4 ngay trên mục menu).

> Mục popup chỉ hiện khi con trỏ đang trong một hàm (địa chỉ thuộc body hàm). Nếu tool
> chưa kết nối, action vẫn phát event nhưng không có client nào nhận — Console in rõ
> `(chưa có tool nào kết nối)`.

## API contract

| Endpoint | Nội dung |
|---|---|
| `GET /api/health` | version bridge, program active, language, trạng thái token |
| `GET /api/functions?q=&offset=&limit=` | danh sách function nội bộ |
| `GET /api/decompile?address=` | pseudocode, signature và map symbol → địa chỉ |
| `GET /api/resolve?addresses=a,b` | cập nhật metadata symbol theo địa chỉ |
| `GET /api/goto?address=` | **v1.8.0** — nhảy con trỏ CodeBrowser tới hàm (tool → ghidra) |
| `GET /events` | SSE `symbolRenamed`, `symbolChanged`, `programActivated`, `programDeactivated`, `syncFunction` |

Contract này cũng được mô phỏng bởi `../tests/mock_bridge.js`; chạy `npm run test:ghidra-live` ở thư mục tool để kiểm tra full UI + HTTP + SSE mà không cần Ghidra thật.

## Bảo mật

- Server chỉ lắng nghe `127.0.0.1` và kiểm tra `Host` loopback (có IPv4, `localhost`, IPv6 `::1`).
- API hiện là **read-only** — không có endpoint rename, patch hay ghi file.
- Token là lớp bảo vệ bổ sung cho local bridge. Không reverse-proxy/mở port này ra mạng; token đi trong URL vì `EventSource` không gửi custom header.

## Vì sao không còn `pom.xml`

Đường Maven đòi bạn tự copy 9 JAR của đúng bản Ghidra vào `ghidra-plugin/lib/` — thiếu một
JAR là `mvn package` hỏng, còn Gradle tự lấy classpath từ `GHIDRA_INSTALL_DIR`. Vì vậy `pom.xml`
và `src/assembly/ghidra-extension.xml` đã được xoá ở 1.7.0; build bằng `gradlew`/`build-zip.bat`
(Gradle Wrapper đã kèm sẵn, không cần cài).
