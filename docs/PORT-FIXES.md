# PORT-FIXES — Rà soát tương đương v1.9.3 → v2.0 (2026-09)

Rà soát từng file JS thuần cũ đối chiếu bản React, sửa các lỗi logic và tính
năng bị đánh rơi khi port. Core (lexer/parser/cfg/colors/anchors) vốn đã đúng
100% — mọi sửa chữa nằm ở tầng UI/graph/notes/ghidra/export.

## 1. Lỗi logic (bản React chạy sai / chết so với bản cũ)

| # | Triệu chứng | Nguyên nhân | Sửa tại |
|---|---|---|---|
| 1 | Click token không TẮT được highlight đang bật | `toggleHlKey` thiếu nhánh non-additive toggle-off của `interact.js` cũ | `src/store/useStore.js` |
| 2 | Search dim / pin-focus / focus edge **không nhìn thấy gì** | CSS vẫn gate theo `#board.dimmed` / `#board.nhover` mà FlowView không bao giờ gắn 2 class này | `src/graph/FlowView.jsx` (derive class từ data) |
| 3 | Token khớp search không có viền `.tk.on`; fallback text không có viền cam `.hit` | `computeHighlights` không trả dữ liệu token hit | `src/ui/search.js` + `src/ui/highlight.js` + `src/graph/CfgNode.jsx` |
| 4 | Click badge ✓/⚠/✗ không mở card note | `toFlowGraph` nuốt mất `onOpenNote` (chỉ forward 2 handler) | `src/graph/build.js` |
| 5 | Edge có note không có chấm màu (mất `.edgeDot`); click edge không mở card | `noteState` không bao giờ gán cho edge; `onEdgeClick` thiếu `openNoteForEdge` | `src/graph/build.js`, `src/notes/ui.js`, `src/graph/CfgEdge.jsx`, `src/graph/FlowView.jsx` |
| 6 | Export SVG gạch đứt loại `goto` | lệch cả bản cũ (case) lẫn in-app (case/false) | `src/export/svg.js` |
| 7 | `notesMode` mất sau reload | `setNotesMode` ghi store trần, bỏ qua `_persistOpts` (bản cũ `saveState()`) | `src/notes/ui.js` |
| 8 | Gõ search lúc 🧭 luồng chính đang bật → cờ `mainPathOn` treo | bản cũ `clearMainPath(true)` trong `applyHighlights` | `src/ui/highlight.js` |
| 9 | Card mở từ chip E#/panel 📖/jumpToRef → mọi nút trong card chết | `refreshNoteNodes()` xây lại card không có handlers | `src/notes/ui.js` (`registerCardHandlers` registry) + `src/App.jsx` |
| 10 | Nút Clear: notes/highlight/manualPos/layoutScope treo lại, build rỗng còn in cảnh báo | chỉ `setSrc('') + rebuild` | `src/store/useStore.js` (`clearWorkspace`) + `src/ui/SidePanel.jsx` |
| 11 | Đổi theme không đổi màu edge tới lần build sau | màu edge nằm trong `data`, cần render lại (bản cũ `renderGraph keepView`) | `src/App.jsx` (watch theme → rebuild keepView) |
| 12 | Thiếu toast "Đã tự áp dụng notes đã lưu" | build chỉ toast `renamed`, bỏ `autoApplied` | `src/graph/build.js` |
| 13 | 🐛 Export Debug chỉ còn snapshot viewport/log | mất dump tokens+AST+CFG+adjacency của `exportDebugData()` cũ | `src/export/index.js` (port đầy đủ, version `_meta` 2.0.0) |
| 14 | Card/ô note bị dbl-click zoom-fit | bản cũ guard `.noteCard` trong dblclick | `src/graph/FlowView.jsx` |

## 2. Tính năng bản cũ bị rớt khi port

| # | Tính năng | Sửa tại |
|---|---|---|
| A | `fitView` sau build từ đầu (Ctrl+Shift+Enter · Sample · mở file · Ghidra mở hàm) — `fitView` prop của React Flow chỉ chạy lúc mount | `src/store/useStore.js` (`fitNonce`) + `src/App.jsx` + `src/graph/FlowView.jsx` |
| B | Số dòng `#lineNums`: render sai thẻ (`div` — CSS chờ `span` → dòng lỗi không đỏ) + mất sync scroll với textarea | `src/ui/SidePanel.jsx` |
| C | Auto-save `pcode.src` mỗi 10s qua `requestIdleCallback` | `src/App.jsx` |
| D | Mở file: chặn >2MB, whitelist ext, toast "Đã nạp …", `onerror`, accept đầy đủ; kéo-thả cả vùng graph (cũ nhận `#board` + `#src`) | `src/ui/SidePanel.jsx` (`loadSourceFile`, `SOURCE_ACCEPT`) + `src/App.jsx` |
| E | Gập các section panel trái + persist `pcode.coll.i<idx>` (helpers có sẵn mà không ai dùng) | `src/ui/SidePanel.jsx` (`Sect`) |
| F | Panel 📖 tương tác 2 chiều: hover câu → tô `.pl` block/edge (trước chỉ set attribute `data-pl` không ai đọc); click block → tô câu (`highlightSentenceForNode`) | `src/notes/ui.js` (`applyProsePl`) + `src/notes/ProsePanel.jsx` + `src/graph/FlowView.jsx` (`plNodeRef`) |
| G | Nút 🗺 bật/tắt minimap (FEATURES F5) | `src/graph/FlowView.jsx` |
| H | Ghidra: tự kết nối khi tool được bridge phục vụ kèm `?token=` (`autoBridge` cũ) | `src/ghidra/GhidraPanel.jsx` |
| I | Debug HUD thiếu FPS + nút 💥 Kill stuck | `src/ui/DebugPanel.jsx` + `FlowView` (`killStuck`) |
| J | Click edge không cập nhật `#hlInfo` mô tả edge; click ghim/bỏ ghim không toast | `src/graph/FlowView.jsx` |
| K | Hint panel/HelpOverlay nói "dbl-click block = mở/gập" trong khi code zoom tới | `src/ui/SidePanel.jsx`, `src/ui/HelpOverlay.jsx` |

## 3. Sửa cấu trúc

- **`index.html` root** trước là BẢN BUILD SẴN (trỏ `/assets/index-*.js`) nên
  `npm run dev`/`build` bundle lại artifact cũ, không ăn `src/`. Nay trỏ
  `/src/main.jsx` đúng chuẩn Vite (giữ script chống flash theme).
  → Build thật: 228 modules, `dist/` có chunk elk/dagre/xyflow sạch.
  → Plugin Ghidra ("Tool Dir") nên trỏ tới thư mục `dist/` **sau khi
  `npm run build`** (hoặc giữ bản prebuilt cũ trong `assets/`).

## 4. Kiểm chứng

- `npm run build` xanh (Vite 8, 228 modules).
- `vitest` (env node): 222/224 — 2 fail còn lại cần `document` (jsdom) là test
  DOM thuần tuý, vốn đã không chạy được trên Node 20 từ trước đợt sửa.
- `node smoke-v2.mjs` (repo root sandbox): 5 nhóm kiểm tra logic mới sửa đều
  PASS, kể cả build ELK thật trên SAMPLE (27 blocks/36 edges), forward
  `onOpenNote`, `tokOn`/`.hit`, `noteState` edge, `clearWorkspace`.

## 5. Còn cố ý giữ khác bản cũ (quyết định thiết kế của v2, không sửa)

- Zoom clamp 0.1–8 (SPEC), chuột trái kéo block thay chuột phải (README §5),
  chuột phải vào nền không chặn menu trình duyệt, Ctrl+F = focus ô tìm
  (README v2; bản cũ Ctrl+F = fit), toast xếp chồng tối đa 4 thay chuỗi
  1400ms, Esc stack toàn cục (bản cũ chỉ có Esc trong ô tìm).

---

## Vòng 3 — rà soát từng file còn lại (graph/view/card/panel/export/persistence)

| # | Vấn đề | Sửa |
|---|--------|-----|
| 23 | **React Flow controlled mà thiếu `onNodesChange`/`onEdgesChange`** → kéo block (manual layout) bị hất về chỗ cũ ngay khi thả tay; `manualPos` không bao giờ có tác dụng | `FlowView`: thêm 2 handler `applyNodeChanges`/`applyEdgeChanges` ghi vào store |
| 24 | Kéo block xong ô note/card DỪNG YÊN ở chỗ cũ (bản cũ gọi `renderNotes()` sau drag) | `onNodeDragStop` giờ gọi `refreshNoteNodes()` |
| 25 | Edge **`false` bị gán nét đứt** (inline `strokeDasharray '5 4'` át CSS) + hover không dày nét + loop sai 1.6px; nhãn goto bị ghép thêm chữ "goto " | `CfgEdge`: bỏ inline width/dasharray, để `.edge/.dashed/.loop/:hover` của CSS cũ điều khiển; nhãn = `e.elabel || sty.label` nguyên văn |
| 26 | Xuất SVG gắn nhầm `dashed` cho cả `false` (cùng lỗi 25) | `export/svg.js`: `dashed` chỉ cho `case` |
| 27 | **Mode LR (↔) bị gãy**: khoá cạnh luôn Top/Bottom | `CfgNode` nhận `rankdir` trong data; LR → target Left / source Right |
| 28 | Sau reload (notesMode='full' persist) hoặc import notes không qua `setNotesMode`, **vùng dự trù ô note = {}** → ô note đè lên block (bản cũ `prepareNoteReserves()` chạy trước MỖI lần layout) | `build()` tự tính lại `noteReserve` khi mode full + notes đã match |
| 29 | `__pcode.importAINotes()` (API) nạp xong không vẽ lại graph (bản cũ gọi renderGraph keepView) | `api.js`: import OK → `rebuild(true)` |
| 30 | Splitter: mặc định 380 & max 60% → **430px & 72%** như CSS/JS cũ; dbl-click/Home = reset về CSS + **xoá** `pcode.sideW` (trước ghi đè giá trị sai vào key); thiếu trả kéo khi pointercancel | `ui/Splitter.jsx` |
| 31 | Toast 📤 AI data / 📋 AI prompt mất nửa hướng dẫn ("…rồi bấm 📥 Notes để nạp note", số block trong prompt); modal dán notes không tự focus+select như cũ | `App.jsx` toast parity + `autoFocus`/`select()` trên `#pmText` |
| 32 | Esc TRONG ô tìm kiếm cũng kích hoạt stack Esc toàn cục (đóng panel 📖/card/mainpath ngoài ý muốn; bản cũ chỉ `clearHl()`) | `SearchBar.jsx` stopPropagation ở phím Esc |
| 33 | `fitView` bản cũ không bao giờ phóng quá 100% (`scale ≤ 1`); RF mặc định phóng to graph nhỏ → view đổi liên tục. `centerNode` cũ giữ zoom (≥85%) chứ không fit theo block | `FlowView`: mọi `fitView` dùng `{maxZoom:1, padding:0.07}`; `centerNode` → `setCenter(n, zoom=max(hiện tại,0.85))`, dùng chung cho dbl-click block |
| 34 | ♻ rebuild trong Debug HUD vẽ lại từ đầu (mất view); bản cũ `build(true)` giữ view | `DebugPanel`: `rebuild(true)` |

## Vòng 4 — lỗi UI trình duyệt ("click block không mở note", 2026-09-02)

| # | Vấn đề | Sửa |
|---|--------|-----|
| 35 | **Toolbar + HUD.note (`position:absolute`) đè dải đỉnh canvas** — `fitView` đặt block đầu B1 + badge ✓ đúng dải đó nên click rơi vào nút toolbar (đo `elementFromPoint`: tâm badge B1 → `BUTTON#btnImportNotes`); ngoài ra `#boardWrap #board{position:absolute;inset:0}` cho canvas phủ cả hàng toolbar → nút toolbar ngược lại bị block line đè (click 📥 Notes treo) | `App.jsx`: `#boardWrap` flex-column + hàng `#boardTop` (NotesHud + Toolbar in-flow, wrap được); `app.css`: `#toolbar`/`#notesHud` bỏ absolute, `#board` → `position:relative; flex:1; min-height:0` — xem BUG-REPORT **U1** |
| 36 | Node `notePanel` height=0 (`.notePanel` absolute → wrapper đo 0) → RF culling >400 phần tử có thể ẩn nhầm ô note | `notes/cards.js`: `buildNotePanelNodes` đặt `height: pd.h` — xem BUG-REPORT **U2** |
| 37 | **`assets/` (bản deploy tĩnh ở gốc) là bundle CỖ chưa hề build lại** sau mọi fix + `index.html` gốc bị ghi đè bởi bản dev (`/src/main.jsx` → mở tĩnh trắng) → người dùng chạy bản cũ nên "click block không mở note" tưởng chưa sửa | `npm run build` lại; thêm `scripts/postbuild.mjs` (tự đồng bộ `dist/` → `index.html`+`assets/` ở gốc sau mỗi build); tách `index.dev.html` làm entry dev (vite input + `npm run dev` mở sẵn) — xem BUG-REPORT **U3** |
| 38 | **Click THÂN block không mở card note** — spec F13 ("Click block/edge → card mở cạnh block; Esc đóng card trước rồi mới bỏ focus") chỉ được nối lại cho edge; block chỉ ghim focus | `FlowView.onNodeClick`: block có note + notes bật → `openNoteForNode` (click lại = đóng); thêm `clearFocus` + bước cuối stack Esc — xem BUG-REPORT **U4** |

## Vòng 5 — phản hồi Ghidra thật (bôi đen note + "chạy bản cũ", 2026-09-02)

| # | Vấn đề | Sửa |
|---|--------|-----|
| 39 | **Bôi đen (drag-select) text trong card note không được** — 1.9.3 loại `#noteLayer` khỏi mọi gesture board trước `preventDefault()` (comment trong `interact.js` nói rõ) nên mousedown trên card tới selection native; bản React card là node XYFlow `draggable:true` → d3-drag ăn mousedown cả thân card | `notes/cards.js`: node card `dragHandle:'.nc-head'` — kéo card chỉ qua header; `app.css`: `.nc-head{cursor:move;user-select:none}`, `.nc-body{user-select:text}` — xem BUG-REPORT **U5** |
| 40 | **Sau `npm run build`, tab `127.0.0.1:8765` vẫn chạy bản cũ** — bridge phục vụ tĩnh không gắn `Cache-Control` → browser dùng index.html + bundle cũ từ HTTP cache (bridge đọc đĩa mỗi request, không phải Ghidra giữ file cũ; Restart+URL-token-mới / Ctrl+Shift+R bypass cache nên "tự hết") | Plugin Java + `ghidra/PcodeGrapherBridge.py`: `assets/*` → `Cache-Control: public, max-age=31536000, immutable`; còn lại → `no-cache, must-revalidate` — xem BUG-REPORT **U6** |
| 41 | **Bôi đen text trong card xong chuột phải KHÔNG có menu Copy** — card/ô note là node React Flow nên `onNodeContextMenu` preventDefault cho MỌI node; 1.9.3 note card là DOM thường (ngoài gesture board) nên menu native vẫn hiện | `FlowView.onNodeContextMenu`: node type ≠ `cfg` → return không preventDefault (menu native trên card/panel); block cfg giữ right-click = copy code — xem BUG-REPORT **U7** |
| 42 | **Wheel chuột không cuộn được nội dung card note** — RF `zoomOnScroll`+`preventScrolling` nuốt wheel trên mọi node; 1.9.3 có guard wheel riêng ("scroll trong card = scroll nội dung, không zoom") | `NoteCardNode.jsx`: thêm class `nowheel` (RF `noWheelClassName`) vào root `.noteCard` + `.notePanel` — wheel trên card/ô note = cuộn native/không zoom, nền vẫn zoom — xem BUG-REPORT **U8** |

## Vòng 6 — Ghidra thật: rename live + mũi tên xuyên block (2026-09-03)

| # | Vấn đề | Sửa |
|---|--------|-----|
| 43 | **Rename BIẾN CỤC BỘ trong Ghidra không đồng bộ live (phải F5)** — plugin chỉ map hàm/toàn-cục vào symByText nên SSE rename của local var mang địa chỉ lạ → tool bỏ qua | Tool: `bridge.js` — rename địa chỉ lạ → debounce 400ms re-decompile hàm đang xem `keepView` (tên mới hiện ngay, không cần plugin mới). Plugin 1.8.2: `walkMarkup` map local var qua `getHighSymbol()` — xem BUG-REPORT **U9** |
| 44 | **Kéo block → mũi tên xuyên qua block khác ("graph loạn")** — fallback smoothstep khi `anchorsOk` fail không tránh vật cản; route ELK cũ cũng bị block khác kéo rơi đè | Mới `src/graph/astarRoute.js`: router A* trực giao tránh block + `polylineHitsRects` (Liang-Barsky) phát hiện route ELK bị đè → reroute; CfgEdge subscribe `rfNodes` — xem BUG-REPORT **U10** |
| 45 | **SSE `syncFunction` (Ctrl+Shift+G) nạp code nhưng không rebuild graph** — `ghidraStartEvents(session)` gọi không ctx → `ctx.rebuild` undefined | `bridge.js`: module giữ rebuild App đăng ký (`setRebuildOnRename`), SSE dùng khi thiếu ctx — xem BUG-REPORT **U11** |

Đã cân nhắc mà GIỮ khác bản cũ thêm:
- Đường cạnh trong app: ưu tiên route ELK (như bản cũ); khi node bị kéo làm route lỗi thời thì router A* tránh block (`astarRoute.js`, U10) tự vẽ đường trực giao mới — không còn smooth-step thẳng_tuột xuyên block như trước. Mũi tên vẫn màu kind, đứt nét case/loop như cũ; export SVG vẫn tự dựng từ layout nên export khớp nhau.
- Vị trí nhãn cạnh ở giữa (bản cũ đặt T/F lệch về phía nguồn kiểu IDA) — RF label center đọc được, tránh chồng nhãn khi edge ngắn.
- Không còn `snapEdgeEndsToBlocks`: vì kích thước "phồng" chỉ dùng làm khoảng đệm layout, node RF vẽ đúng kích thước block → mũi tên bám biên block thật sẵn.
- `repositionNoteCard` mỗi frame khi zoom — không cần vì card là node trong viewport.

