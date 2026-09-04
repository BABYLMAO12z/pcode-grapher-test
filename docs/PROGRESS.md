# TIẾN ĐỘ v2 — nhật ký thực thi T0→T12

Cập nhật: 2026-09-01

| Task | Trạng thái | Ghi chú |
|---|---|---|
| T0 — Scaffold Vite + khung test | ✅ DONE | commit `v2: T0` |
| T1 — Port core + vitest | ✅ DONE | commit `v2: T1` |
| T2 — Store zustand + persistence migrate | ✅ DONE | commit `v2: T2` |
| T3 — Layout adapter ELK/dagre | ⏳ tiếp theo | |
| T4–T12 | ⬜ chưa | |

**Tổng test hiện tại: 316 xanh** (`npm test`, ~17s).

---

## T0 — Definition of Done

- [x] `npm run dev` chạy (Vite 8.2.2, port 5173, proxy `/api` + `/events` → `http://127.0.0.1:8765`).
- [x] `npm test` chạy (vitest 4.1.11 + jsdom 30, setupFiles `tests/setup.js`).
- [x] `npm run build` ra `dist/` sạch.
- [x] File cũ chuyển vào `legacy/` (`index.html`, `build.mjs`, `pcode-grapher.min.html`,
      `pcode-grapher.standalone.html`) — FILE-MAP §C nói XOÁ nhưng git history giữ; ở đây tạm để
      trong `legacy/` để đối chiếu khi port UI, sẽ xoá hẳn ở T12.
- [x] 5 tài liệu hợp đồng đưa vào `docs/`.

### Lệch so với SPEC (đã xử lý, không đổi quyết định)

1. **Node 22 bắt buộc.** Sandbox mặc định Node 20; `jsdom@30` yêu cầu `^22.22.2 || ^24.15.0 || >=26`
   và `vite@8` yêu cầu `^20.19 || >=22.12`. Đã cài Node 22.22.2 và thêm `.nvmrc`.
2. **`manualChunks` phải là hàm** với Vite 8 (rolldown), không nhận object. Đã viết dạng hàm —
   vẫn tách chunk `elk` / `dagre` đúng ý D12/T12.
3. `eslint`/`prettier` chưa thêm (SPEC §1 liệt kê) — dời sang T12 cùng bước "lint + docs cuối".

## T1 — Definition of Done

- [x] **Core port nguyên văn.** `diff` giữa `js/core/*` và `src/core/*` CHỈ có dòng import/export:
  - `lexer.js`: +`export { lex, MULTI_OPS }`
  - `parser.js`: +`export { Parser, parseFunction, fnNameOf }`
  - `cfg.js`: +`export { CfgBuilder }`
  - `colors.js`: bỏ khối `PcodeCore`/`module.exports` cuối file → thay bằng `export {...}`
  - `anchors.js`: +`import { KEYWORDS, isGhidraOp } from './colors.js'`, 2 dòng global-guard
    `(typeof KEYWORDS !== 'undefined')` → tham chiếu trực tiếp, bỏ khối gắn `PcodeCore` cuối file
  - `src/core/index.js` dựng lại `PcodeCore` (mới, thay cho global scope)
  - `'use strict';` bỏ ở mọi file (ESM luôn strict) — không đổi ngữ nghĩa
- [x] `src/ui/tokens.js` port ($ , esc, needSpace, renderToks, plainToks, lineHTML, lineClass, lineText).
- [x] `src/sample.js` — SAMPLE copy nguyên văn từ `js/ui/main.js`.
- [x] `npm test` xanh: **225 test** (yêu cầu ≥60), tổng ~15s.
- [x] Fuzz **5.000 hàm** ngẫu nhiên (PRNG mulberry32, seed cố định, 20% input hỏng có chủ ý):
      **6,2s** (< 30s), 239.871 node; bất biến: parse không ném lỗi, errors ≤ 32,
      CFG không cạnh treo / không cạnh trùng, anchors khớp chính nó đủ số ref.

### ✅ Mâu thuẫn tài liệu — ĐÃ GIẢI QUYẾT (chủ dự án xác nhận 01/09/2026)

`TASKS.md` T1 / `FEATURES.md` F1 ghi sample `activation::check` → *25 nodes / 33 edges*.
Đo thật trên core v1.9.3 nguyên văn (`lexer.js` + `parser.js` + `cfg.js`, SAMPLE trích từ `main.js`):

> **27 nodes / 36 edges, `warnings` rỗng**

**Nguồn gốc số sai:** comment stub của chính repo cũ — `tests/test.js` dòng 3–13
(*"PASS 100% (25 node / 33 cạnh OK)"*) — đã lỗi thời; tài liệu hợp đồng chép theo mà không đo lại.
`README.md` repo gốc dòng 297 xác nhận cấu trúc mới là 27 block / 36 cạnh.

**Đã xử lý:** không đụng core (đúng quy tắc cấm sửa core). Test khoá ở 27/36 + warnings rỗng.
Cập nhật 5 chỗ trong tài liệu: `TASKS.md` (T1 việc + DoD, T3, T4), `FEATURES.md` (F1, F9),
`FILE-MAP.md` (§D `tests/test.js`), `SPEC.md` (§7 cfg).

### Bố cục test hiện có

```
tests/setup.js            stub ResizeObserver, DOMMatrixReadOnly, matchMedia, offsetWidth/Height…
tests/core/lexer.test.js    46 test — token class, literal số, multi-op, đếm dòng ln
tests/core/parser.test.js   32 test — if/while/do-while/for/switch/goto/label, errors cap 32, guard 30.000
tests/core/cfg.test.js      31 test — sample 27/36, collapse, dedupe, input xấu
tests/core/colors.test.js   59 test — KEYWORDS/TYPE_WORDS, 4 vị từ, varColor FNV-1a, classifyId
tests/core/anchors.test.js  34 test — skeleton bất biến rename, jaccard, matchBlocks 3 pass, matchEdges
tests/core/tokens.test.js   21 test — esc chống inject, needSpace, renderToks, lineClass
tests/core/fuzz.test.js      1 test — 5.000 hàm ngẫu nhiên
```


---

## T2 — Definition of Done

- [x] **Store zustand** `src/store/useStore.js` theo SPEC §3 — đủ slice:
      `src/graphData/lastParsed/parseMsgs/renderSeq/building`, `opts` (9 field) + `theme`,
      `rfNodes/rfEdges/layoutScope/manualPos/expanded`, `hlKeys/hlOrder/hlIdx` + **`lit`/`dimmed` RIÊNG**,
      notes slice (`notes/notesMode/openNoteKey/openNoteAnchor/mainPathOn/noteReserve`),
      `ghdr` (giữ đúng 12 tên field của `js/ui/ghidra.js`) + **`liveNames` Map (D8)**,
      `ui` (`dbgOpen/proseOpen/pasteOpen/helpOpen/sideW/toasts/safeMode/netStatus/warn/errLine/dbgLog`).
- [x] **Persistence giữ nguyên key cũ** `src/store/persistence.js`:
      `pcode.src` / `pcode.opts` / `pcode.theme` / `pcode.sideW` / `pcode.ghidra.url` /
      `pcode.ghidra.recent` / `pcode.coll.i<idx>`; `pcode.notes` để notes-store.js tự quản (T6).
- [x] Test migrate: localStorage **chỉ có** `pcode.opts` (9 field) → `hydrate()` cho đúng giá trị,
      key cũ **còn nguyên từng byte**, và **không sinh key mới nào**.
- [x] Test session: `tests/fixtures/demo-notes-old.session.json` → nạp đúng 10 trường,
      notes v2 (`meta/blocks/edges/summary/match`) nguyên vẹn, round-trip bằng nhau.
- [x] `manualPos/expanded` **không** persist (chỉ theo scope trong phiên) — có test khẳng định.
- [x] Mọi slice test được bằng `useStore.getState()`, không cần React: **78 test store**.
- [x] Hằng số port từ `state.js` → `src/graph/constants.js`: **13 test** khoá màu/số EXACT.

### Quyết định triển khai (trong khuôn khổ SPEC, có ghi chú)

1. **KHÔNG dùng `zustand/middleware.persist`.** SPEC §3 gợi ý `persist` + `partialize {src, opts}`,
   nhưng middleware đó gom mọi thứ vào MỘT key mới (mặc định `pcode-storage`) — mâu thuẫn trực tiếp
   với D11/§4 ("giữ nguyên key cũ, không tạo key mới"). §4 là "quyết định duy nhất" nên D11 thắng:
   port thẳng `loadState()/saveState()` thành `persistence.js`, store gọi `write*` khi giá trị đổi.
2. **`src/graph/constants.js` là file mới** (FILE-MAP nói `state.js` → `useStore.js` + `layout.js`).
   Lý do: `EDGE_PALETTES`/`PRESETS`/`collapsibleBlock`/`srcScopeOf` được store, layout, exporter và
   CfgEdge cùng dùng → để trong store sẽ tạo vòng import `store ↔ layout`. Nội dung port nguyên văn.
3. **`notesMode` nằm ngoài `opts`** trong store (đúng SPEC §3) nhưng vẫn được ghi CHUNG vào
   `pcode.opts` như bản cũ — `_persistOpts()` luôn kèm `notesMode` hiện hành.
4. **`currentEdgePalette(theme)`** nhận theme tường minh (D8: 1 nguồn sự thật); vẫn fallback đọc
   class `.light` khi gọi không tham số, để phần code chưa port vẫn chạy đúng.
5. `applySessionState()/sessionState()` đặt ở store ngay từ T2 (chỉ phần đặt/đọc state);
   phần đọc-ghi FILE + validate thuộc T9 (F10).

### Ghi chú test
- `import.meta.url` trong môi trường jsdom là `http://` → không dùng `new URL(..., import.meta.url)`
  để đọc fixture. Dùng `resolve(process.cwd(), 'tests/fixtures', name)`.

## T4 — React Flow canvas ✓
- `src/graph/CfgNode.jsx`, `CfgEdge.jsx` (+`EdgeMarkers`), `NoteCardNode.jsx` (sơ khai, đủ ở T7),
  `build.js` (build/toFlowGraph/buildAdjacency/getPlainText), `FlowView.jsx`, `App.jsx` shell.
- DoD: SAMPLE ra **27 blocks · 36 edges**, tag B1..B27 đúng thứ tự; chuột phải copy code + toast;
  click nền xoá highlight; safe mode bỏ Background; graph lớn bật `onlyRenderVisibleElements`.
- Test: `tests/ui/flow.test.jsx` 35/35. Build 1.47s, elk/dagre tách chunk lazy (D12).

## T5 — Search / highlight / hotkeys ✓
- `src/ui/search.js` (port `_matcherFor/matchKey/applyHighlights/stepHl`, thuần, không DOM),
  `src/ui/highlight.js` (cầu nối store ⇄ React Flow), `src/ui/SearchBar.jsx`, `src/ui/hotkeys.js`.
- FlowView nhận `apiRef` → `fitView/zoom100/zoomIn/zoomOut/pan/centerNode` cho hotkey + prev/next.
- DoD: 4 tuỳ chọn Aa/`.*`/`\b`/solo + dim; fallback văn bản khi 1 key không khớp token;
  edge chạm node lit vẫn sáng; thứ tự kết quả theo toạ độ (trên→dưới, trái→phải);
  debounce 120ms; Enter/Shift+Enter/Esc/✕; Ctrl+Enter build, Ctrl+F, Ctrl+1, F, 1, +/-, mũi tên.
- **Highlight sống qua rebuild** (tính lại từ graphData thay vì bám DOM).
- Test: `tests/ui/search.test.jsx` 33/33 · **tổng 428 test / 15 file, 33.6s**.

## T6 — Notes: anchor / store / ai (port nguyên văn) ✓
- `src/notes/env.js` — lớp thay GLOBAL (notes/graphData/lastParsed/nodePlain/GHDR/toast…),
  cho phép port 3 file **không sửa một dòng thuật toán nào**.
- `src/notes/anchors.js` (← notes-anchor.js 358d), `store.js` (← notes-store.js 415d),
  `ai.js` (← notes-ai.js 411d, AI_PROMPT_HEAD/SCHEMA chép nguyên văn), `index.js` (wire zustand).
- `build.js` thêm `getAllPlainText()` + `setNotesSync()` → build xong tự `syncNotesWithGraph()`
  (đúng chỗ bản cũ gọi ở cuối `renderGraph`), báo toast khi note tự đổi tên biến.
- DoD: import full JSON ✓, off-by-one ✓, orphan ✓, LRU 8 ✓, cap 2 MB ✓, rename alpha→beta ✓,
  ✎ manual không bị ghi đè ✓, migrate payload v1 ✓, `aiDataJson` giữ indent-1 golden ✓.
- Test: `tests/notes/notes.test.js` 64/64 · **tổng 492 test / 16 file, 36.7s**.
- Ghi chú fixture: `ai-real-offbyone.json` là output cho hàm `FUN_140042a80` — KHÁC hàm của
  `demo-notes-old.session.json`, nên không dùng để kiểm dịch ref được; ca off-by-one dựng
  trực tiếp từ graph thật (`aiOffByOne`), fixture kia giữ lại ở test "không dịch bừa/không ném".

## T7 — Notes UI: HUD / card / panel / main path ✓
- `src/notes/cards.js` — port hình học đặt card (estimate*, rectOverlapsAny, overlapAreaWithAll,
  bestCardCandidate, pickCardSlot, prepareNoteReserves) + dựng node `notePanel` / `noteCard`.
- `src/notes/ui.js` — hành vi trên store: setNotesMode/cycleNotesMode/noteCounts, open/close card,
  jumpToRef, applyNoteText (✎ manual), applyMainPath/clearMainPath, refreshNoteNodes.
- `src/notes/mainpath.js` — computeMainPath + mainPathFallback (BFS entry, chỉ plain/true).
- `src/graph/NoteCardNode.jsx` — bản ĐẦY ĐỦ: header/footer dính, CODE 3 dòng (tên live), ↪ NHÁNH RA,
  chip ref, ✏️ sửa (✓ lưu / ↺ huỷ), 📋 note / code+note / AI prompt; thêm `NotePanelNode`.
- `NotesHud.jsx`, `ProsePanel.jsx`, App: paste modal 📥, phím **N** cycle mode, Esc stack
  (paste → search → main path → card → panel).
- **Bỏ ~250 dòng DOM thủ công**: card note là NODE React Flow, nét nối là edge `noteConn`
  → pan/zoom/reposition miễn phí, mở card 10 lần vẫn đúng 1 node (test chống leak).
- DoD: card không đè block ✓, ô note lật trái khi sát biên ✓, badge ✓/⚠/✗ ✓, demo session cũ
  load ra HUD/card/panel ✓, checklist ❓ có tiến độ ✓.
- Test: `tests/notes/notes-ui.test.jsx` 58/58 · **tổng 550 test / 17 file, 38.4s**.

## T8 — Ghidra bridge (LIVE mode) ✓
- `src/ghidra/bridge.js` — port js/ui/ghidra.js (604 dòng), **không đụng DOM**: trạng thái ở
  store `ghdr` + `liveNames` Map (D8) thay cho applySymbolOverlay/clearLiveOverlay sửa `<span>`.
  Giữ nguyên: `parseBridgeUrl` (tách ?token, localhost→127.0.0.1, cùng origin→base rỗng, chặn path),
  token ở cả query lẫn header `X-Bridge-Token`, timeout 35s, session guard, heartbeat 30s,
  zombie 40s, dirtyGap → `/api/resolve` chunk 60 / tối đa 480, `/api/goto`.
  **Giữ cả 2 bản vá leak heartbeat** của bản cũ (clear `_hb` cũ trước; nhánh session cũ clear CHÍNH NÓ).
- `src/ghidra/GhidraPanel.jsx` — khối GHIDRA LIVE trong side panel (giữ id `#ghUrl/#ghToken/#ghConnect/
  #ghDisconnect/#ghSync/#ghFilter/#ghFuncs/#ghStatus/#ghSecurity/#ghHelp`), dropdown URL gần đây,
  bootstrap token khi bridge tự phục vụ tool (Tool Dir mode).
- store: `ghdr` thêm `functions/functionsHasMore/functionsLimit`; `ui` thêm
  `ghStatus/ghState/ghSecurity/ghSecurityState/ghHelp/flashAddr`. Recent dùng `saveRecentUrl` của
  store → **cap 8 theo D11** (bản cũ cắt 5) — ghi vào Nợ kỹ thuật/khác biệt có chủ ý.
- Rename trong Ghidra → `updateSymbolsAtAddress` đổi `liveNames` **và gọi `syncNotesToGraph()` ngay**
  (note không lệch tên với graph), lỗi notes không phá luồng rename.
- DoD: offline luôn độc lập (test: bridge chết vẫn build được graph) ✓, mock bridge contract ✓,
  SSE 5 loại event ✓, heartbeat không nhân đôi ✓, `_teardown` không rò ✓.
- Test: `tests/ghidra/bridge.test.js` 47/47 · **tổng 597 test / 18 file, 40.4s**; `npm run build` OK.

## T9 — Exporter + session + window.__pcode ✓
- `src/export/svg.js` — port NGUYÊN VĂN `buildExportSVG`: bảng màu token dark/light, `lineSvg`
  (tspan theo `needSpace`), `nodeRectStyle`, `visibleLinesOf` (tôn trọng collapse HEAD_L/TAIL_L),
  `getGraphBounds` (+24 padding), marker mũi tên theo palette, KHÔNG `<foreignObject>`.
  Nguồn toạ độ đổi từ `nodeEls[].style` → positions/sizes của node React Flow; cạnh dựng lại path
  bezier (TB/LR) vì RF không giữ SVG string.
- `src/export/index.js` — `download`, `exportSVGFile`, `exportPNG` (rasterize canvas, 2× cap 8192px),
  `sessionData/exportSession/importSession` (notes gán TRƯỚC build; `notes:null` → gỡ card + main path
  + `dropSavedNotesForCurrentSource`), `dbgSnapshot/exportDebugData`.
- `src/api.js` — `window.__pcode` giữ **đúng 15 tên hàm** SPEC §8.3; `PCODE_API_NAMES` được test khoá.
  FlowView thêm `getView/setView` để `setView/getState` đọc-ghi viewport RF.
- App: nút ⭳ SVG / ⭳ PNG / 💾 Session / 📂 Mở + hotkey Ctrl+S, Ctrl+O.
- DoD: SVG đúng token màu/B#/nhãn/theme ✓, cap 8192 ✓, collapse tôn trọng ✓, session round-trip ✓,
  import file session v1.9.3 (fixture) ✓, đủ hàm `__pcode` ✓.
- Test: `tests/export/export.test.jsx` 37/37 · **tổng 634 test / 19 file, 46.1s**.

## T10 — UI shell: sidebar / splitter / toolbar / toast / debug / theme ✓
- `src/ui/SidePanel.jsx` — port khối `#side`: 6 mục (MÃ NGUỒN · 🔗 GHIDRA LIVE · TÙY CHỌN HIỂN THỊ ·
  HIGHLIGHT · CHÚ THÍCH MÀU · CHUỘT & PHÍM TẮT), số dòng + tô dòng lỗi parser, kéo-thả file .c/.txt,
  preset/rankdir/colorVars/dim.
- `src/ui/Toolbar.jsx` — 16 nút giữ nguyên id bản cũ; zoom %/1:1/Fit; Shift+click AI data/prompt = ẩn hex;
  📖/🧭/🐞 sáng theo store.
- `src/ui/Splitter.jsx` — kéo/dbl-click reset/phím ←→Home, `clampSideW` min 280 (D11) – max 60% cửa sổ,
  persist `pcode.sideW`.
- `src/ui/DebugPanel.jsx` (F2) — snapshot JSON + log 40 dòng cuối + 📋 copy + ♻ rebuild + safe mode + thu gọn.
- `src/ui/HelpOverlay.jsx` (phím ?) — bảng phím tắt, đóng bằng × / click nền / Esc.
- `hotkeys.js` thêm **F2** (chạy cả khi đang gõ, như bản cũ) và **?**; Esc stack đầy đủ:
  paste modal → help → search → main path → note card → prose → debug.
- `App.jsx` viết lại: header (theme 🌙/☀️ + netStatus + ❓), main = side + splitter + board, statusbar
  (stats · đang vẽ · zoom%), toast host, modal 📥, `#sessionFile`.
- **2 lỗi thật phát hiện nhờ test, đã sửa trong code (không phải test)**:
  1. `dbgLog` lưu `{t,msg}` nhưng DebugPanel render thẳng object → React ném lỗi; nay format giờ + text.
  2. `toast()` chỉ đẩy vào hàng đợi mà **không tự rút** (bản cũ ẩn sau 3.2s) → thêm `TOAST_MS = 3200`
     + cap hàng đợi 4.
- DoD: F5/F16/F17/F18 ✓; đổi theme/preset/rankdir không mất highlight & manualPos ✓; splitter persist ✓;
  keyboard walk (F2, ?, N, Esc, Ctrl+S/O) ✓; `npm run dev` chạy sạch (kiểm tra preview thật).
- Test: `tests/ui/shell.test.jsx` 31/31 · **tổng 665 test / 20 file, 45.0s**.

## T11 — Test hệ thống + QA + benchmark + README ✓
- `tests/integration/app.test.jsx` (18) — render `<App/>` THẬT, đi hết luồng: khởi động SAMPLE
  (27 blocks · 36 edges), reload dùng `pcode.src`, paste + Ctrl+Enter, search → lit/dimmed, Esc stack,
  📥 modal notes → badge + ô note + HUD, phím N, theme, preset (không mất highlight), F2 / ?,
  `window.__pcode`, session round-trip, export SVG, code rác, Clear, import session v1.9.3.
- `tests/integration/stress.test.js` (8) — 2.101 phần tử build **1,3s** (<8s DoD); ngưỡng dagre;
  search 901 node = 4ms; import 451 note = 19ms; build 10 lần không dồn node; đổi hàm 10 lần dọn
  manualPos; build dồn 3 lần không kẹt cờ `building`.
- **Lỗi thật thứ 3 phát hiện & sửa**: dán văn bản không phải mã → 0 block, **không cảnh báo gì**
  (màn hình trống khó hiểu). Thêm cảnh báo ở TẦNG build (`src/graph/build.js`), KHÔNG đụng core.
- Benchmark ELK vs dagre (Node 22): 121n=594/73ms · 271n=459/145 · 601n=1128/306 · 901n=1691/619 ·
  1651n=4593/999 → **giữ `DAGRE_AT = 400`** (D3 đã xác nhận bằng số, ghi vào README §4).
- README viết lại hoàn toàn: install/dev/build/test, 19 nhóm tính năng, kiến trúc, bảng dòng code
  (**giải trình 7.676 vs mục tiêu 5.900–6.200**), benchmark, changelog v2.0, 3 bug đã sửa,
  3 khác biệt có chủ ý. Hết mọi nhắc tới `file://`.
- DoD: `npm test` **691 test / 22 file, chạy 2 lần đều xanh, 60–66s** (<3 phút) ✓; stress ✓; README ✓.

## T12 — Build production + dọn dẹp + docs cuối ✓
- `npm run build` **sạch, không còn cảnh báo**: bỏ dynamic-import vòng vo trong `export/index.js`,
  tách chunk `react` / `xyflow` / `elk` / `dagre`, đặt `chunkSizeWarningLimit` trên đúng chunk lazy elk.
  Tải lần đầu **~520 kB / 170 kB gzip**; elk (1,4 MB) + dagre chỉ tải khi thực sự layout.
- `npm run preview` trả 200 (thay `pcode-grapher.min.html` của v1); `npm run dev` chạy sạch.
- **Bổ sung html-to-image theo SPEC §2**: `exportPNGView()` chụp ĐÚNG khung nhìn (kèm ô note/card/badge
  vốn là DOM của React Flow, không có trong SVG dựng tay) — Shift+click nút ⤓ PNG. PNG mặc định vẫn là
  đường rasterize SVG như bản cũ (nét sắc, cap 8192px).
- Dọn mã chết: xoá `js/`, `css/`, `legacy/` (build.mjs + standalone/min.html), 27 file test stub cũ,
  `dist/` và `node_modules/` ra khỏi git (thêm `.gitignore`). GIỮ: `ghidra/`, `ghidra-plugin/`,
  `PROMPT-AI-NOTES.md` (tài liệu người dùng), `tests/mock_bridge.js`.
  `js/ui/notes-ai.js` → `tests/fixtures/legacy-notes-ai.js` để test tiếp tục khoá nguyên văn AI prompt.
- `package.json` → **2.0.0**; `docs/TASKS.md` thêm bảng trạng thái T0–T12.
- DoD: build + preview ✓ · elk/dagre tách chunk lazy ✓ · README + 5 tài liệu khớp code ✓ ·
  git status sạch ✓ · **693 test / 22 file, ~60s**.
- Tổng dòng: **7.712 JS/JSX + 762 CSS** (mục tiêu 5.900–6.200 → vượt ~24%, đã giải trình ở README §4).
