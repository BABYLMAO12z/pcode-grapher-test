# PCODE Grapher — Bộ công việc tái cấu trúc sang React (v2.0)

> Tài liệu này là **hợp đồng kỹ thuật** giữa người chủ dự án và AI viết mã.
> AI viết mã PHẢI đọc đủ 5 file theo thứ tự: `README.md` → `SPEC.md` → `FILE-MAP.md` → `FEATURES.md` → `TASKS.md`,
> rồi làm lần lượt T0 → T12. Không tự ý đổi quyết định trong `SPEC.md`; nếu gặp mâu thuẫn, dừng lại và báo cáo.

---

## 1. Bối cảnh

- **Dự án hiện tại:** [`pcode-grapher`](https://github.com/BABYLMAO12z/pcode-grapher) v1.9.3
  — tool vẽ control-flow graph từ pseudocode decompile Ghidra/IDA, chạy offline mở thẳng `file://`.
- **Kiến trúc hiện tại:** HTML + CSS + JS classic script (không module, không build step), renderer DOM/SVG tự viết
  (pan/zoom/minimap/interaction ~1.200 dòng thủ công), layout bằng ELK.js, kèm AI Notes và Ghidra Live bridge.
- **Dữ liệu thực tế của người dùng:** hàm dài nhất ~1.000 dòng code, thường 200–500 dòng;
  khi bật AI notes hiển thị (×2) → tối đa **~1.200–1.600 phần tử** trên graph. **KHÔNG BAO GIỜ chạm 3.000+ block.**
  → DOM-based React Flow chịu được thoải mái; không cần canvas/WebGL.

## 2. Mục tiêu

1. Chuyển sang **React 19 + Vite 8 + @xyflow/react (React Flow) 12.11.6** — chạy qua **HTTPS/localhost** (bỏ ràng buộc `file://`).
2. **Giữ nguyên 100% chức năng** của v1.9.3 (danh sách đầy đủ trong `FEATURES.md`).
3. **Giữ nguyên 100% logic lõi** (`js/core/*` — lexer/parser/CFG/colors/anchors) và logic AI Notes / Ghidra client.
4. Bỏ ~1.200 dòng render + tương tác thủ công (thay bằng React Flow có sẵn), bỏ `build.mjs`/standalone/min.html (thay bằng Vite).
5. Xây **bộ test thật** bằng Vitest (repo cũ chỉ có test STUB — xem `FILE-MAP.md` mục tests).
6. `ghidra-plugin/` (Java) và `ghidra/PcodeGrapherBridge.py` **KHÔNG ĐƯỢC ĐỤNG TỚI** — giữ nguyên trong repo.

## 3. Quyết định kỹ thuật (ĐÃ CHỐT — không bàn lại)

| # | Quyết định | Lý do |
|---|---|---|
| D1 | **React 19 + Vite 8 + @xyflow/react 12.11.6** | Cộng đồng lớn nhất, node = React component (giữ được tô màu token), MiniMap/Controls/viewport có sẵn; Vue Flow ngừng cập nhật từ 01/2026; X6 API imperative + wrapper kém |
| D2 | **zustand 5.0.15** cho state + persist | Thay biến global + localStorage thủ công của bản cũ |
| D3 | **elkjs 0.12.0** layout chính, **@dagrejs/dagre 3.1.1** tự chuyển khi **> 400 nodes** | Dữ liệu người dùng: tối đa 1.200–1.600 phần tử; ELK O(n²) quá chậm ở ~800+. Ngưỡng 400 là ước lượng — AI viết mã PHẢI chạy lại benchmark bằng parser bản chính ở T11 và chỉnh hằng số nếu cần |
| D4 | **html-to-image 1.11.13** cho export PNG; **giữ nguyên builder SVG** của bản cũ cho export SVG | PNG: chụp DOM graph (màu token giữ nguyên); SVG: port `buildExportSVG()` |
| D5 | **JS + JSDoc** (không chuyển TypeScript) | Repo gốc dùng JS; tránh churn; vẫn typecheck được bằng `tsc --checkJs` nếu muốn |
| D6 | `src/core/*` port **nguyên dạng** (chỉ đổi classic script → ES module + export) | Không sửa logic, không "tối ưu lại" |
| D7 | Note card + nét nối block↔card = **2 node/edge đặc biệt của React Flow** (không phải div overlay) | Tự bám pan/zoom, không cần đồng bộ toạ độ thủ công |
| D8 | Symbol live (Ghidra) = **`liveNames` Map trong store** (thay `applySymbolOverlay` sửa DOM) | SSE rename → setState → re-render; 1 nguồn sự thật cho graph + notes + export |
| D9 | Dev: **Vite proxy** `/api` + `/events` → `http://127.0.0.1:8765` (bridge Ghidra) | Tránh CORS/PNA; không sửa plugin Java |
| D10 | Giữ `window.__pcode` API (cùng tên + chức năng) | Test hook + automation phụ thuộc |
| D11 | Persistence: **giữ NGUYÊN key localStorage cũ** `pcode.src/opts/theme/sideW/notes` + `pcode.ghidra.url/recent`; migrate = đọc key cũ lần chạy đầu, KHÔNG tạo key mới, KHÔNG xoá key cũ (SPEC §4) | Người dùng không mất cấu hình; quay lại bản cũ vẫn chạy |
| D12 | Xoá khỏi cấu trúc mới: `build.mjs`, `pcode-grapher.standalone.html`, `pcode-grapher.min.html`, `css/style.css` (port vào `src/styles`), `js/lib/` (dùng npm) | Vite thay thế toàn bộ |

## 4. Số liệu ước lượng (dựa trên repo chính, đo thật)

| Nhóm | Dòng cũ | Dòng mới (ước) | Ghi chú |
|---|---:|---:|---|
| `js/core/*` (5 file) | 1.089 | 1.089 | Giữ 100%, chỉ thêm export |
| Render + tương tác (graph.js, view.js, arrange.js, interact.js, hover.js, minimap.js) | 1.208 | ~500 | React Flow thay ~700 dòng |
| AI Notes (6 file) | 2.498 | ~2.000 | Logic giữ, DOM → component |
| Ghidra client (ghidra.js) | 604 | ~450 | Logic giữ, DOM → store |
| Main/state/tokens/actions/search/debug/exporter | 1.567 | ~1.100 | — |
| index.html + css/style.css | 970 | ~850 (JSX + css) | — |
| **Tổng app** | **7.936** | **~5.900–6.200** | **Giảm ~20–25%** |

> ⚠️ Lưu ý trung thực: bản chính **không có Konva** (khác bản test), nên mức giảm dòng khiêm tốn hơn con số
> "58%" từng nói ở bản test. Lợi ích thật của đợt này: **kiến trúc hiện đại, bỏ code render/input thủ công,
> dễ bảo trì + mở rộng**, chứ không phải "code ngắn đi một nửa". ~3.600 dòng logic nghiệp vụ (core + notes + ghidra)
> là "xương sống" phải giữ.

## 5. Bộ tài liệu

| File | Nội dung |
|---|---|
| `README.md` | File này — tổng quan + quyết định |
| `SPEC.md` | Kiến trúc đích: cây thư mục, store, mapping React Flow, layout adapter, contracts |
| `FILE-MAP.md` | Từng file cũ → giữ / port / thay / xoá, kèm danh sách hàm phải giữ nguyên |
| `FEATURES.md` | 19 nhóm tính năng, cách port từng nhóm + tiêu chí nghiệm thu (acceptance) |
| `TASKS.md` | 13 task T0–T12 theo thứ tự, mỗi task có files + definition of done + test phải pass |
