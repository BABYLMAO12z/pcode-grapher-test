# Khắc phục lỗi PCODE Grapher Bridge

## Không thấy plugin trong `File → Configure`

1. Xác nhận ZIP được build bằng lệnh `build-zip.bat` hoặc `./gradlew buildExtension` với đúng `GHIDRA_INSTALL_DIR`.
2. Cài ZIP trong **Ghidra Project Manager** rồi restart hoàn toàn Ghidra.
3. Mở **CodeBrowser**, vào `File → Configure → Developer` và tìm **PCODE Grapher HTTP bridge**.
4. Kiểm tra ZIP có cấu trúc này (tên ngày có thể khác):

```text
PcodeGrapherBridge/
  extension.properties
  Module.manifest
  lib/PcodeGrapherBridge.jar
```

```bat
jar tf dist\*.zip
```

`Module.manifest` và `extension.properties` phải nằm ở gốc extension; JAR phải có prefix `PcodeGrapherBridge`. Gradle build đã tạo đúng cấu trúc này.

Nếu Extension Manager của máy bạn không cài được ZIP, đóng Ghidra và giải nén thư mục `PcodeGrapherBridge/` vào profile Extensions, ví dụ:

```text
%APPDATA%\ghidra\ghidra_12.1.3_PUBLIC\Extensions\PcodeGrapherBridge\
```

Sau đó restart Ghidra.

## Console không in URL bridge

- Plugin chưa được bật trong **CodeBrowser**. Vào `File → Configure → Developer` để bật.
- Xem `Window → Console` để tìm `PCODE Grapher bridge` hoặc lỗi bind port.
- Port `8765` có thể đang được dùng. Trong `Edit → Tool Options → PCODE Grapher`, đổi `Port`, sau đó chọn `Tools → PCODE Grapher Bridge → Restart server`.

## UI báo `missing/invalid token`

Dán **toàn bộ** URL console in ra vào ô URL. Ví dụ `http://127.0.0.1:8765/?token=abc` được giao diện tự tách token. Hoặc nhập `http://127.0.0.1:8765` và token riêng vào ô Token.

Nếu vừa đổi `Require Token`/`Token`, restart server từ menu Tools trước khi kết nối lại.

## UI kết nối được nhưng báo chưa có program active

Bridge đã chạy đúng nhưng CodeBrowser chưa có binary hiện hành. Mở/import program hoặc chuyển sang tab program; UI sẽ nhận `programActivated` qua SSE và tự nạp danh sách hàm.

## Decompile timeout / không thấy symbol live

- Decompile function đó trực tiếp trong Ghidra trước để kiểm tra decompiler có hoạt động.
- Bridge timeout mặc định là 30 giây; response vẫn có pseudocode lỗi thay vì treo UI.
- Chỉ token markup có địa chỉ và primary symbol được overlay. Local variable/compiler temporary không có symbol address vẫn được graph tô màu như chế độ offline.

## Build fails

- Ghidra 12.1.3 cần **JDK 21**, không phải JRE/JDK 11.
- Kiểm tra `GHIDRA_INSTALL_DIR` trỏ tới thư mục chứa `ghidraRun`/`support/buildExtension.gradle`.
- Chạy `gradlew clean buildExtension` để bỏ class cũ.
