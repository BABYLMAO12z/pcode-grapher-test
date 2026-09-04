# TASKS — T0→T12, thứ tự bắt buộc, mỗi task có Definition of Done

> Quy tắc chung:
> - Làm theo thứ tự T0→T12. Task N chỉ bắt đầu khi task N-1 có **Definition of Done ✓**.
> - Mỗi task: commit riêng (hoặc nhóm commit) có message theo quy ước `v2: Tn — <mô tả>`.
> - KHÔNG sửa `src/core/*` ngoài task T1; mọi thay đổi core sau đó chỉ qua báo cáo bug.
> - Mọi UI đọc dữ liệu từ store (zustand), không đọc global/DOM khác.
> - Chạy được `npm run dev` + `npm test` ở mọi thời điểm (test hiện có phải xanh trước khi sang task kế).
> - Ước lượng là **thời gian làm việc của 1 dev full-time** (tổng ~14–18 ngày).

---

## T0 — Scaffold Vite + khung test (0.5 ngày) · phụ thuộc: —
**Việc:** `npm create vite@latest . -- --template react` (JS); cài deps chính xác theo SPEC §2 (react 19.2.8, react-dom 19.2.8, @xyflow/react 12.11.6, zustand 5.0.15, elkjs 0.12.0, @dagrejs/dagre 3.1.1, html-to-image 1.11.13; dev: vite 8.2.2, @vitejs/plugin-react 6.1.1, vitest ^4.x, jsdom 30.0.1, @testing-library/react 16.3.3, @testing-library/user-event ^14.x, @testing-library/jest-dom ^6.x); vite.config.js (react plugin, test: jsdom, setupFiles, server.proxy `/api` + `/events` → `http://127.0.0.1:8765` theo D9); index.html root #app + theme pre-script; xoá boilerplate demo; `src/main.jsx` mount App; vitest chạy được với 1 smoke test.

**DoD:**
- [ ] `npm run dev` mở được trang trắng + proxy /api/health trả lỗi "fetch failed" thay vì 404 Vite.
- [ ] `npm test` chạy 1 test qua; `npm run build` ra dist/.
- [ ] Commit `v2: T0`.

## T1 — Port core + vitest (3 ngày) · phụ thuộc: T0
**Việc:** chép nguyên văn 5 file core sang `src/core/` (FILE-MAP §A, SPEC §5), export ESM, `src/core/index.js` dựng lại `PcodeCore`; port `src/ui/tokens.js` (chỉ cần `$`→DOM helper dùng trong test, esc, renderToks, plainToks, lineHTML, lineClass, lineText); viết test theo SPEC §7: lexer (mọi token class + đếm dòng), parser (25 fixture: lỗi, do-while, for 3 phần, goto/label, case, switch, hàm nhiều, hàm rỗng, hàm 2 tham số, lệnh >80 char, comments), cfg (27 node/36 edge sample — số đo thật, KHÔNG phải 25/33 trong comment stub cũ; collapse limit; dedupe), colors, anchors (jaccard + matchBlocks 3 pass), fuzz 5.000 hàm ngẫu nhiên (bất biến: parse không ném lỗi ngoài lề đã biết; CFG không crash; anchor không crash).

**DoD:**
- [ ] File core bản port **khác bản cũ chỉ ở dòng import/export** (kiểm tra diff, không có đổi logic).
- [ ] `npm test` xanh (≥60 test); fuzz 5.000 chạy <30s.
- [x] Sample `activation::check` → **27 nodes / 36 edges** đúng (25/33 trong comment stub `tests/test.js` là lỗi thời; README gốc dòng 297 xác nhận 27/36).
- [ ] Commit `v2: T1`.

## T2 — Store zustand + persistence migrate (1.5 ngày) · phụ thuộc: T1
**Việc:** store theo SPEC §3 (shape đầy đủ: graphData, lastParsed, expanded, manualPos, rankdir 'TB'/'LR', preset, colorVars, theme, sideW, hlKeys, lit/dimmed riêng, notes slice, notesMode, openNoteKey, mainPathOn, ghidra slice, liveNames, ui slice: dbg, toast, warn); persistence theo SPEC §4: **giữ nguyên key cũ** `pcode.src/opts/theme/sideW/notes` + `pcode.ghidra.url/recent`, migrate = đọc key cũ lúc khởi động, KHÔNG tạo key mới, KHÔNG xoá key cũ; `manualPos/expanded` không persist (chỉ theo scope trong phiên); `pcode.notes` v2 giữ nguyên key + format.

**DoD:**
- [ ] Test migrate: localStorage chỉ có key cũ `pcode.opts` (9 field) → load → store có đúng giá trị, key cũ CÒN NGUYÊN (không xoá).
- [ ] Test notes: file demo-notes-old.session.json → notes v2 nạp đúng.
- [ ] Mọi slice test được bằng `useStore.getState()` (không phụ thuộc React).
- [ ] Commit `v2: T2`.

## T3 — Layout adapter ELK/dagre (2 ngày) · phụ thuộc: T2
**Việc:** `src/graph/layout.js`: `measureNodes` (DOM ẩn theo SPEC §6.1 — render CfgNode skeleton vào container off-screen, đo height; cache theo `id|expanded|width|theme|preset`); `cfgToElkGraph` giữ nguyên văn (layoutOptions chính xác theo file cũ); ELK ≤400 block; dagre >400 (rankdir, nodesep/ranksep theo preset); fallback grid khi cả hai fail; `collapse`/`expand` → đo lại + layout; `keepView` (đo viewport, delta block gốc, panBy); stats nodes/edges.

**DoD:**
- [ ] Sample 27 node: layout ELK **giống bản cũ** (so ảnh chụp hoặc tọa độ: block entry trên cùng, cạnh không đè nhau, không chồng lấp).
- [ ] 1.200–1.600 phần tử: layout ELK ≤5s (dev machine), không freeze UI; >400 → tự chuyển dagre và log 1 lần.
- [ ] Block 1.000 dòng (gập): đo nhanh, không layout lại vô ích khi chỉ hover.
- [ ] Expanded toggle: vị trí các block còn lại ổn định (không nhảy lung tung — dùng layoutOptions cũ).
- [ ] Test đơn vị layout (tọa độ vào `layoutResult`); commit `v2: T3`.

## T4 — CfgNode/CfgEdge + FlowView + minimap (2.5 ngày) · phụ thuộc: T3
**Việc:** CfgNode.jsx (F3), CfgEdge.jsx (SmoothStep + label theo kind: cond 'T'/'F', loop '↺', goto 'goto …', case 'case …'; màu theo edge palette; hover tô), NoteCardNode + noteConn edge (F15 — sơ khai, đủ để card hiện), FlowView.jsx (RF + onNodeClick/onEdgeClick/onPaneClick/onNodeContextMenu/onNodeDragStop/onMoveStart=clearHighlight, fitView, onlyRenderVisibleElements khi >400 phần tử — thống nhất với ngưỡng dagre D3, minZoom 0.1/maxZoom 8, MiniMap, Controls, Background); CfgNode/CfgEdge/NoteCardNode bọc React.memo, props ít nhất có thể (dữ liệu từ store selector); build() trong store chạy pipeline SPEC §6, renderSeq guard; manualPos; rebuild node refs.

**DoD:**
- [ ] Sample render đúng: 27 block, tag B1..B27, ENTRY đầu, cạnh có nhãn T/F/↺/goto/case đúng loại, màu theo preset+theme.
- [ ] Click token/edge/hover, kéo block, click phải copy, dbl-click — theo F6/F7 acceptance (toàn bộ).
- [ ] Pan/zoom/minimap/fit/100% theo F5 (trừ theme/preset/rankdir — ở T10).
- [ ] 1.200 phần tử: scroll/pan mượt (≥30fps dev), chỉ render phần thấy (verify bằng count nodes trong DOM).
- [ ] Rebuild nhiều lần liên tiếp: không nháy trắng, kết quả cuối đúng.
- [ ] Commit `v2: T4`.

## T5 — Search/highlight/collapse/hotkey nền (1.5 ngày) · phụ thuộc: T4
**Việc:** SearchBar + matchKey/stepHl (F6), applyHighlights → lit/dimmed map trong store (không đổi rfNodes); toggleExpand + đo lại (F4); collapse của CfgNode; global keydown (F8, trừ notes/phím N ở T7, F2 ở T10); Esc stack (search → …).

**DoD:**
- [ ] Toàn bộ acceptance F6 và F4 ✓.
- [ ] Search regex/word/solo + `1/9` + dim hoạt động; highlight sống qua rebuild/đổi preset (test).
- [ ] Phím tắt cơ bản (F, 1, +/−, arrows, Ctrl+Enter, Ctrl+Shift+Enter) ✓.
- [ ] Commit `v2: T5`.

## T6 — Notes: anchor/store/ai port (2 ngày) · phụ thuộc: T5
**Việc:** port NGUYÊN VĂN `notes-anchor.js`, `notes-store.js`, `notes-ai.js` (FILE-MAP §B); `src/notes/index.js` wire vào store: loadSavedNotes theo nguồn, syncNotesWithGraph sau build, importAINotes, reanchorNotes, aiDataJson/aiPromptText/download/copy, notePromptFor.

**DoD:**
- [ ] Test notes-jsdom cũ (81+ checks) được viết lại thành vitest và xanh: import full JSON, off-by-one fixture, orphan, LRU 8, bytes cap, rename-sync alpha→beta, ✎ manual không bị ghi đè.
- [ ] `aiDataJson`/`aiPromptText` output **diff bằng nhau** với bản cũ trên cùng input (test golden).
- [ ] `pcode.notes` ghi/đọc đúng; migrate từ v1 không crash.
- [ ] Commit `v2: T6`.

## T7 — Notes UI: HUD/card/panel/main path (2 ngày) · phụ thuộc: T6
**Việc:** NotesHud (F15), NotesCard trong NoteCardNode (edit ✎, chips, buttons, header/footer dính, Esc đóng), NotesPanel prose (glow tím, click nhảy), mainPath (🧭), phím N cycle, reposition card khi layout đổi, card không đè block (noteReserve).

**DoD:**
- [ ] Toàn bộ acceptance F15 ✓ (chạy tay + test notes-stage cũ viết lại: card không đè block, edge nối nằm trên biên).
- [ ] Demo session cũ load → HUD/card/panel đúng (không cần AI).
- [ ] Không leak: chuyển hàm 10 lần → DOM card cũ bị gỡ (kiểm tra bằng test).
- [ ] Commit `v2: T7`.

## T8 — Ghidra bridge + proxy + liveNames (2 ngày) · phụ thuộc: T4 (UI chỗ), T6 (notes dùng tên live)
**Việc:** `src/ghidra/bridge.js` port (F11/F12, FILE-MAP); GHDR slice store; Vite proxy đã có từ T0; liveNames Map (D8) được CfgNode/CfgEdge/notes/export đọc; flashAddress; SSE với session guard + reconnect cơ bản; mock_bridge port sang tests/.

**DoD:**
- [ ] Tất cả acceptance F11 + F12 ✓ với mock_bridge (chạy mock lên, dùng dev server).
- [ ] rename qua /api/test/rename → token đổi tên tức thì, không rebuild; rebuild không mất (test).
- [ ] Decompile hàm mới → graph mới đúng; syncFunction event hoạt động.
- [ ] Sai URL → lỗi rõ ràng, không treo UI.
- [ ] Commit `v2: T8`.

## T9 — Exporter + session + __pcode (1.5 ngày) · phụ thuộc: T4 (graph), T6 (AI data)
**Việc:** exporter port (F9): buildExportSVG nguyên văn, exportPNG = html-to-image, exportDebugData; session export/import (F10); `window.__pcode` expose (SPEC §8.3) — các hàm đọc store + gọi action, giữ tên y hệt.

**DoD:**
- [ ] Acceptance F9 ✓ (SVG đúng token màu/B#/nhãn/theme; PNG 2x rõ; cap 8192px; collapse tôn trọng).
- [ ] Acceptance F10 ✓ (session round-trip + file cũ import).
- [ ] `window.__pcode.*` test từ console: đủ 17 hàm, hoạt động (SPEC §8.3).
- [ ] Commit `v2: T9`.

## T10 — UI shell: sidebar/splitter/toolbar/toast/debug/theme (1.5 ngày) · phụ thuộc: T9
**Việc:** SidePanel (editor + Ghidra Live + notes controls + debug), Toolbar (Build, preset, dir, theme, zoom%, export menu, search), Toast queue (F17), DebugPanel F2 (F16), splitter (F18), theme class + edge palette swap, statusbar + netStatus, responsive + a11y (F18), safe mode.

**DoD:**
- [ ] F5 (theme/preset/rankdir), F16, F17, F18 acceptance ✓.
- [ ] Theme/preset đổi KHÔNG làm mất highlight/manualPos; lưu persist.
- [ ] Splitter kéo/reset/dbl-click + persist sideW ✓.
- [ ] Full keyboard walk (F2, ?, N, Esc stack) ✓.
- [ ] Commit `v2: T10`.

## T11 — Tests hệ thống + QA (2 ngày) · phụ thuộc: T10
**Việc:** port các test cũ còn lại thành vitest (smoke 20 asserts → ui tests: render, search, minimap, pan, splitter, LR, hlClear, bug-injection; notes-card; anchors; encoding; regression; fix-regression; stress nhẹ 600 phần tử; mem-leak cơ bản); chạy toàn bộ test suite ≥2 lần; benchmark layout >400/1.200/1.600 phần tử (ghi số vào README, điều chỉnh ngưỡng dagre nếu cần — D3 yêu cầu bắt buộc); viết README mới; cập nhật SPEC/FILE-MAP/FEATURES nếu lệch.

**DoD:**
- [ ] `npm test` xanh ≥180 test, <3 phút.
- [ ] Stress 1.600 phần tử: build <8s, pan/zoom ≥30fps (dev), không crash; kết quả benchmark ghi vào README.
- [ ] README mới: install/dev/build/test, tính năng, changelog v2.0, hết nhắc file://.
- [ ] Commit `v2: T11`.

## T12 — Build production + lint + docs cuối (0.5 ngày) · phụ thuộc: T11
**Việc:** `npm run build` sạch; kiểm tra bundle size (kỳ vọng ~2× elkjs 1,6MB); tối ưu nhẹ nếu cần (manualChunks tách elk/dagre); chạy build+test+dev toàn bộ lần cuối; dọn file chết; kiểm tra git status sạch; cập nhật SPEC/TASKS (đánh dấu hoàn thành); xoá nhánh cũ nếu có.

**DoD:**
- [ ] `npm run build` + `npm run preview` hoạt động (thay thế pcode-grapher.min.html).
- [ ] Bundle report: elkjs và dagre tách chunk, có thể lazy-load.
- [ ] Tổng dòng code mới nằm trong ~5.900–6.200 (README §4 — bảng số liệu); nếu lệch >10% → giải trình trong PR.
- [ ] README + 5 tài liệu khớp code thật.
- [ ] Commit `v2: T12 — release v2.0.0` + tag.

---

## Nợ kỹ thuật (ghi nhận, KHÔNG làm trong đợt này)
- Ngưỡng 400 block cho dagre là ước lượng từ dữ liệu người dùng (tối đa 1.200–1.600 phần tử); phải chạy lại benchmark ở T11 và điều chỉnh hằng số nếu cần.
- Hành vi "kéo block bằng chuột phải" (arrange.js): mặc định cho phép kéo bằng chuột trái + lưu manualPos; nếu muốn giữ đúng hành vi cũ (chỉ chuột phải kéo) → triển khai như task nâng cao P2.
- `notes-card.js` reposition khi resize cửa sổ: hiện RF xử lý tốt; nếu phát hiện lệch ở T7 thì bổ sung ResizeObserver (P2).
- Quota 2MB notes: giữ nguyên; không nâng cấp lên IndexedDB trong đợt này (P3).
- `pcode-grapher.standalone.html`/`min.html` bị bỏ: nếu người dùng cần bản offline 1 file → tạo lại bằng vite-plugin-singlefile như task riêng (P2).

---

## Trạng thái thực hiện (cập nhật cuối T12)

| Task | Trạng thái | Commit | Test tích luỹ |
|---|---|---|---|
| T0 scaffold | ✓ | `a673402` | — |
| T1 core port | ✓ | `39e56a4` | — |
| T2 store | ✓ | `c661368` | 316 |
| T3 layout | ✓ | `f0725e3` | 360 |
| T4 graph React Flow | ✓ | `8c64fff` | 395 |
| T5 search/highlight/hotkeys | ✓ | `ac5636b` | 428 |
| T6 notes anchor/store/ai | ✓ | `1dea3c4` | 492 |
| T7 notes UI | ✓ | `d0865f1` | 550 |
| T8 Ghidra bridge | ✓ | `627a008` | 597 |
| T9 exporter/session/__pcode | ✓ | (T9) | 634 |
| T10 UI shell | ✓ | (T10) | 665 |
| T11 test hệ thống + README | ✓ | (T11) | 691 |
| T12 build + dọn + docs | ✓ | (T12) | 693 |
