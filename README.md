# ⚡ PCODE Grapher v2.0

Vẽ **control-flow graph** từ pseudocode decompile của **Ghidra / IDA**: paste mã → thấy ngay sơ đồ
khối, mỗi biến một màu, tìm kiếm kiểu IDA, chú giải AI bám theo từng block, và chế độ **Ghidra Live**
đổi tên trong Ghidra là graph đổi theo tức thì.

v2.0 viết lại nền giao diện bằng **React 19 + Vite 8 + @xyflow/react** (v1.9.3 là HTML + classic
script). Toàn bộ **logic lõi giữ nguyên 100%** — cùng parser, cùng CFG, cùng thuật toán neo note.

---

## 1. Cài đặt & chạy

### Chạy ngay KHÔNG cần Node (bản build sẵn ở gốc repo)

Repo theo quy ước deploy tĩnh: `index.html` + `assets/` ở **gốc** luôn là bản build mới nhất
(script `npm run build` tự đồng bộ — xem `scripts/postbuild.mjs`). Phục vụ thư mục gốc qua HTTP
là dùng được ngay:

- đặt **Tool Dir** của bridge Ghidra trỏ vào thư mục gốc rồi mở URL bridge in ra, hoặc
- `python -m http.server 8000` rồi mở `http://localhost:8000/`.

> ⚠️ Không mở `file://…/index.html` trực tiếp — app là ES module, cần HTTP (như v1.9.3 trở đi).
> File `index.dev.html` là bản dev (không chạy tĩnh); mở nhầm sẽ hiện hướng dẫn.

### Dev / build / test (cần **Node 22**, xem `.nvmrc`)

```bash
npm install
npm run dev       # mở /index.dev.html — live-reload Vite
npm run build     # build + TỰ CẬP NHẬT index.html & assets/ ở gốc (postbuild)
npm run preview   # xem thử bản build trong dist/
npm test          # vitest run — toàn bộ test
```

> **Khác v1.9.3:** không còn mở trực tiếp bằng `file://`. v2 là ứng dụng ES module nên cần một
> HTTP server — bản build sẵn ở gốc (hoặc `dist/` sau khi build), phục vụ bằng server tĩnh bất kỳ
> (bao gồm cả cách để Ghidra bridge tự phục vụ qua **Tool Dir**).
>
> **U3 (bài học):** từng có thời kỳ `src/` sửa rất nhiều bug nhưng `assets/` ở gốc không được
> build lại — người dùng chạy bản build cũ nên tưởng lỗi chưa sửa. Nay `npm run build` luôn
> đồng bộ bundle mới ra gốc; **sau khi sửa src, nhớ build lại trước khi deploy.**
>
> **U6 (browser cache):** sau `npm run build`, nếu tab bridge (`127.0.0.1:8765`) vẫn chạy bản cũ
> — đó là **HTTP cache của browser** (bridge đọc file từ đĩa lại mỗi request, không phải Ghidra
> giữ bản cũ). Xử lý: **Ctrl+Shift+R** (hard reload) trong tab đó, hoặc Restart bridge + mở URL
> token mới. Bản build bridge mới đã gắn `Cache-Control` (index.html `no-cache`, `assets/*`
> immutable) nên về sau chỉ cần **F5**.

### Nối với Ghidra

1. Cài plugin trong `ghidra-plugin/` (hoặc script `ghidra/PcodeGrapherBridge.py`).
2. Trong Ghidra: **Tools → PCODE Grapher Bridge → Start** (nên bật *Require Token*).
3. Trong app: dán URL Console in ra (kèm `?token=…`) vào ô **🔗 GHIDRA LIVE** → **Kết nối**.

Dev server đã proxy sẵn `/api` và `/events` sang `http://127.0.0.1:8765`, nên chạy `npm run dev`
là cùng origin với bridge — không dính CORS / Private Network Access.

---

## 2. Tính năng

| Nhóm | Nội dung |
|---|---|
| Dựng graph | Lexer/parser C giả của Ghidra · CFG if/else-if/while/do-while/for/switch/goto/label · gộp dòng chữ ký vào block đầu (B1 = block code đầu tiên) |
| Hiển thị | Mỗi biến một màu (FNV-1a) · tô nền dòng điều kiện & prologue · gập block dài (>24 dòng) · 3 mật độ layout · dọc/ngang · sáng/tối |
| Layout | ELK ≤ 400 block, dagre khi lớn hơn (tự chuyển) · giữ vị trí block đã kéo tay |
| Tìm kiếm | Aa / `.*` regex / `\b` trọn từ / "chỉ hiện khớp" · prev/next · Ctrl+click nhiều token |
| AI Notes | 📤 xuất data · 📋 copy prompt · 📥 dán JSON → chú giải từng block & từng mũi tên · badge ✓/⚠/✗ · ô note cạnh block · card sửa tay ✎ · 📖 panel luồng logic · 🧭 luồng chính |
| Note bền vững | Neo bằng "skeleton" bất biến khi đổi tên · tự phát hiện AI đánh số lệch ±1 · lưu theo từng hàm (LRU 8, tối đa 2 MB) · re-import không đè note đã sửa tay |
| Ghidra Live | Duyệt & decompile hàm · tên symbol live · rename trong Ghidra cập nhật cả graph **và** note · đồng bộ 2 chiều con trỏ CodeBrowser |
| Xuất | SVG vector · PNG 2× (cap 8192px; Shift+click = chụp đúng khung nhìn kèm ô note) · session JSON · debug snapshot |
| Khác | Toast · Debug HUD (F2) · overlay phím tắt (?) · splitter kéo được · `window.__pcode` cho automation |

Chi tiết đầy đủ: `docs/FEATURES.md` (19 nhóm, kèm tiêu chí nghiệm thu).

### Phím tắt

`Ctrl+Enter` build · `Ctrl+Shift+Enter` build lại từ đầu · `Ctrl+F` tìm · `Ctrl+S` / `Ctrl+O` session ·
`F` fit · `1` zoom 100% · `+` / `−` zoom · `←→↑↓` pan · `N` xoay vòng chế độ notes ·
`F2` debug HUD · `?` bảng phím tắt · `Esc` đóng lần lượt (modal → help → tìm kiếm → luồng chính →
card note → panel 📖 → debug).

---

## 3. Kiến trúc

```
src/
  core/      lexer · parser · cfg · colors · anchors     ← GIỮ NGUYÊN logic v1.9.3
  store/     zustand store + đọc/ghi localStorage
  graph/     constants · layout (ELK/dagre) · CfgNode · CfgEdge · NoteCardNode · FlowView · build
  notes/     anchors · store · ai (port nguyên văn) + cards · ui · mainpath · HUD · ProsePanel
  ghidra/    bridge (fetch + SSE) · GhidraPanel
  export/    svg (buildExportSVG nguyên văn) · index (PNG/session/debug)
  ui/        search · highlight · hotkeys · SearchBar · SidePanel · Toolbar · Splitter · DebugPanel · HelpOverlay
  api.js     window.__pcode
```

Nguyên tắc: **một nguồn sự thật là store**. Không component nào tự giữ trạng thái graph; tên hiển thị
live của Ghidra là một `Map` trong store (không sửa `textContent` của DOM như bản cũ).

**localStorage giữ nguyên khoá của v1.9.3** — nâng cấp không mất dữ liệu:
`pcode.src`, `pcode.opts`, `pcode.theme`, `pcode.sideW`, `pcode.notes`,
`pcode.ghidra.url`, `pcode.ghidra.recent`. File session cũ import được nguyên vẹn.

---

## 4. Số liệu

### Dòng code

| Phần | v1.9.3 | v2.0 |
|---|---:|---:|
| Logic lõi (`core/`) | 1.089 | 1.103 |
| Store / persistence | — | 664 |
| Graph + layout + render | ~2.400 | 1.462 |
| Notes | 2.098 | 2.117 |
| Ghidra | 604 | 613 |
| UI shell + search | ~1.900 | 922 |
| Export + session + API | ~350 | 524 |
| Bootstrap (App, main, sample) | — | 795 |
| **Tổng JS/JSX** | **~9.900** | **7.676** |
| CSS | 1.180 | 762 |
| Test (thật, Vitest) | 0 (stub) | 6.081 |

> **Giải trình so với mục tiêu ~5.900–6.200 dòng (TASKS T12):** thực tế **7.676**, vượt ~24%.
> Nguyên nhân: (a) yêu cầu *port nguyên văn* 3 file notes + `buildExportSVG` + bridge Ghidra khoá cứng
> ~3.250 dòng không được rút gọn; (b) store zustand (664) và lớp `notes/env.js` + `notes/ui.js` là
> chi phí kiến trúc mới mà ước lượng ban đầu chưa tính; (c) JSDoc + chú thích tiếng Việt giải thích
> *vì sao* mỗi đoạn port giữ nguyên. Phần thực sự cắt được đúng như kế hoạch: **render/tương tác thủ
> công giảm từ ~4.300 xuống 2.384 dòng** (graph + ui shell), tức bỏ hơn 1.900 dòng DOM/pan/zoom/minimap
> nhờ React Flow.

### Benchmark layout (Node 22, jsdom, máy CI)

| Node / cạnh | ELK | dagre |
|---:|---:|---:|
| 121 / 160 | 594 ms | 73 ms |
| 271 / 360 | 459 ms | 145 ms |
| 601 / 800 | 1.128 ms | 306 ms |
| 901 / 1.200 | 1.691 ms | 619 ms |
| 1.651 / 2.200 | 4.593 ms | 999 ms |

`build()` đầy đủ (parse → CFG → đo → layout → node React Flow) với **2.101 phần tử: 1,3 s** —
trong ngưỡng DoD (<8 s). Search trên 901 node: **4 ms**. Import 451 note: **19 ms**.

**Ngưỡng ELK → dagre giữ ở 400 node** (`DAGRE_AT`): dưới mức đó ELK cho bố cục đẹp hơn đáng kể với
chi phí dưới ~0,6 s; trên mức đó ELK tăng siêu tuyến tính (1.651 node mất 4,6 s) trong khi dagre vẫn
dưới 1 s.

### Test

**693 test / 22 file, ~60 s** (`npm test`). Bao phủ: lexer/parser/CFG (kèm fuzz), anchors, store &
persistence, layout, node/edge React Flow, search/highlight, notes (neo, lưu trữ, AI, UI, card),
Ghidra bridge (fetch + SSE giả lập theo đúng contract `mock_bridge`), export SVG/PNG/session,
`window.__pcode`, shell UI, và test tích hợp chạy `<App/>` thật.

---

## 5. Changelog v2.0

**Nền tảng**
- React 19 + Vite 8 + `@xyflow/react` 12 + zustand 5; bỏ `build.mjs`, bỏ bản `standalone/min.html`,
  bỏ `js/lib/elk.bundled.js` (dùng gói npm `elkjs`).
- Bỏ ~1.900 dòng render/pan/zoom/minimap/kéo-thả thủ công — React Flow lo.
- Card note và ô note giờ là **node của graph**: pan/zoom/định vị lại miễn phí, không còn rò DOM khi
  mở card nhiều lần.
- Bộ test thật bằng Vitest (v1.9.3 chỉ có stub `process.exit(0)`).

**Sửa lỗi phát hiện trong quá trình viết lại**
- Toast chỉ xếp hàng mà **không tự biến mất** (bản cũ ẩn sau 3,2 s) → khôi phục.
- Debug HUD render thẳng object log → React ném lỗi khi mở F2.
- Dán văn bản không phải mã nguồn → màn hình trống, **không một lời cảnh báo**; nay báo rõ
  "không tìm thấy hàm nào trong đoạn mã".

**Khác biệt có chủ ý so với v1.9.3**
- `pcode.ghidra.recent` nhớ **8** URL (cũ: 5) — theo quyết định D11.
- Kéo block bằng **chuột trái** (cũ: chuột phải); chuột phải để dành cho menu ngữ cảnh trình duyệt.
- Không còn chạy từ `file://` (xem §1).

---

### Bundle

| Chunk | Kích thước | gzip | Ghi chú |
|---|---:|---:|---|
| `elk` | 1.432 kB | 442 kB | **lazy** — chỉ tải khi layout graph ≤ 400 block |
| `dagre` | 47 kB | 16 kB | **lazy** — graph lớn |
| `react` | 190 kB | 60 kB | |
| `xyflow` | 178 kB | 57 kB | |
| `index` (app) | 152 kB | 53 kB | mã của dự án |
| CSS | 59 kB | 11 kB | |

Tải lần đầu (chưa layout): ~520 kB / **170 kB gzip**. Hai engine layout đều là `import()` động nên
không nằm trong đường tải tới hiển thị đầu tiên.

## 6. Tài liệu

`docs/SPEC.md` (thiết kế + 12 quyết định D1–D12) · `docs/FILE-MAP.md` (bản đồ file cũ → mới) ·
`docs/FEATURES.md` (19 nhóm tính năng + nghiệm thu) · `docs/TASKS.md` (T0–T12 + DoD) ·
`docs/PLAN.md` · `docs/PROGRESS.md` (nhật ký thực thi từng task).

Giấy phép: xem `LICENSE`.
