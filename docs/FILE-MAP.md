# FILE-MAP — từng file cũ → hành động

> Quy ước: **GIỮ** = giữ nguyên văn trong repo (không sửa) · **PORT** = chép logic sang file mới
> (đổi classic script → ES module, DOM → store/component) · **THAY** = thay bằng module/component mới
> (hành vi tương đương) · **XOÁ** = không còn trong cấu trúc mới (git history vẫn giữ).

---

## A. PHẦN LÕI — `js/core/*` (5 file, 1.089 dòng)

| File | Dòng | Hành động | Chi tiết |
|---|---|---|---|
| `js/core/lexer.js` | 57 | **PORT** → `src/core/lexer.js` | Giữ nguyên hàm `lex`; thêm `export { lex }`. KHÔNG sửa regex/đếm dòng. |
| `js/core/parser.js` | 290 | **PORT** → `src/core/parser.js` | Giữ `Parser`, `parseFunction`, `fnNameOf`; export `{ parseFunction, fnNameOf }`. Giữ: errors cap 32, errLine, guard 80.000/30.000/20.000/10.000, do-while thiếu while báo lỗi, for >2 ';' báo lỗi, statement trước case báo lỗi + skip, label ngoài switch. |
| `js/core/cfg.js` | 361 | **PORT** → `src/core/cfg.js` | Giữ `CfgBuilder` toàn bộ: node/link/buildSeq/build/mergeHeaderIntoFirstBlock/collapse (LIMIT = nodes.length+8)/dedupeEdges (string key)/ensureElseIfSeq. Export `{ CfgBuilder }`. |
| `js/core/colors.js` | 105 | **PORT** → `src/core/colors.js` | Giữ KEYWORDS/TYPE_WORDS/isTypeWord/isAddrWord/isConstWord/isGhidraOp/VAR_PALETTE(+light)/varColor/classifyId. Export từng hàm + hằng. `PcodeCore` được dựng lại ở `src/core/index.js` (vì module không dùng global scope). |
| `js/core/anchors.js` | 277 | **PORT** → `src/core/anchors.js` | Giữ fnv1a/skeletonOf/nodeAnchors/buildAnchors/buildEdgeAnchors/jaccard/linesScore/matchBlocks (3 pass)/matchEdges. Thêm `import { KEYWORDS, isGhidraOp } from './colors.js'` (thay global). Export tất cả. |

> ⚠️ Cấm "tối ưu" core trong đợt này. Nếu phát hiện bug → ghi vào `TASKS.md` cuối (mục "Nợ kỹ thuật"), không tự sửa.

## B. PHẦN UI — `js/ui/*` (20 file, 5.519 dòng)

| File | Dòng | Hành động | Chi tiết / hàm phải giữ |
|---|---|---|---|
| `js/ui/tokens.js` | 109 | **PORT** → `src/ui/tokens.js` | `$`, `esc`, `needSpace`, `renderToks`, `plainToks`, `lineHTML`, `lineClass`, `lineText`. Export tất cả. |
| `js/ui/state.js` | 102 | **PORT** → `src/store/useStore.js` + `src/graph/layout.js` | `EDGE_PALETTES` (dark/light — giữ màu EXACT), `currentEdgePalette`, `PRESETS` (compact/normal/wide — giữ số EXACT), `COLLAPSE_AT=24`, `HEAD_L=14`, `TAIL_L=3`, `collapsibleBlock`, `srcScopeOf`/`adoptSourceScope`/`setSourceScope` (FNV-1a 32-bit), biến state → store. |
| `js/ui/graph.js` | 571 | **THAY** → `src/graph/*` | `getElk`→import elkjs; `noteGapPx`(12); `resetStage`→xoá rfNodes; `rebuildNodeRefMap`/`blockRefOf` **giữ nguyên văn**; `buildNodeEl` → CfgNode.jsx (HTML → JSX, giữ class/tag/aria); `cfgToElkGraph` **giữ nguyên văn** (layoutOptions); `snapEdgeEndsToBlocks` **BỎ** (RF tự route); `elkSectionToPoints`/`roundPath`/`mkDefs`/`makeEdgeLabel` **BỎ** (RF edge); `renderGraph` → `build()` trong store (giữ renderSeq guard, applySymbolOverlay → liveNames, prepareNoteReserves → measure, manualPos, stats, buildMinimap → RF MiniMap, fitView, renderNotes); `fallbackLayout` → dagre (giữ grid nếu dagre fail — vẫn cần lưới an toàn). |
| `js/ui/view.js` | 88 | **XOÁ** (RF thay) | Zoom/pan/fit/center → `useReactFlow()`. Giữ `MIN_ZOOM=0.1`, `MAX_ZOOM=8` (đặt trên `<ReactFlow minZoom maxZoom>`). |
| `js/ui/arrange.js` | 58 | **THAY** → FlowView `onNodeDragStop` | Kéo chuột phải sắp xếp block → RF: bật `nodesDraggable`, lưu vị trí vào `manualPos[nid]` (chỉ khi drag bằng nút phải — xem FEATURES F7; nếu phức tạp: cho drag mọi nút trái, `onNodeDragStop` lưu manualPos; giữ hành vi "kéo phải" như nâng cao, đánh dấu P2). |
| `js/ui/debug.js` | 143 | **PORT** → `src/ui/DebugPanel.jsx` | `initDebug`/`dbgLog`/`dbgSnapshot`/FPS/counters/kill stuck/safe mode/copy — chuyển thành component + store slice `ui.dbg`. |
| `js/ui/actions.js` | 61 | **PORT** → store actions | `toggleExpand` (expanded[id]), `copyBlock` (nodePlain → clipboard, fallbackCopy), `toast`. |
| `js/ui/hover.js` | 110 | **THAY** → FlowView handlers | `initHover`/`hoverNode` (click edge → focus 2 đầu; click block → ghim) → `onNodeClick`/`onEdgeClick`/`onPaneClick`; `restoreDimAfterHover` giữ logic. |
| `js/ui/search.js` | 181 | **PORT** → `src/ui/SearchBar.jsx` + store | `hlKeys` (Set), `_reCache`, `_matcherFor`, `matchKey`, `applyHighlights` (tính lit/dimmed/solo), `stepHl` (prev/next + `1/9`), `clearHlMarks`, `initSearch`. Chuyển DOM class → data trong store (`hlOf` map cho CfgNode/CfgEdge). |
| `js/ui/minimap.js` | 124 | **XOÁ** | RF `<MiniMap>` thay (giữ nút toggle 🗺). |
| `js/ui/exporter.js` | 213 | **PORT** → `src/ui/exporter.js` | Giữ: `EXPORT_CSS_LIGHT/DARK`, `TK_COLORS(+light)`, `tokenColor`, `lineSvg`, `nodeRectStyle`, `visibleLinesOf`, `getGraphBounds` (→ từ rfNodes positions/sizes), `buildExportSVG` (vẽ node bằng rect+text/tspan, KHÔNG foreignObject), `download`, `exportSVGFile`, `exportDebugData`. `exportPNG`: THAY bằng html-to-image (chụp container `.react-flow` sau khi fitView; pixelRatio 2; cap 8192px như cũ). |
| `js/ui/ghidra.js` | 604 | **PORT** → `src/ghidra/bridge.js` | Giữ: `GHDR` state → store slice; `ghidraStatus/Security/Help` → store; `failedFetchHelp`, `setGhidraControls`, `clearFunctionList`, `parseBridgeUrl` (nguyên văn), `bridgeUrl`, `ghidraFetch` (token header), `clearLiveOverlay`→xoá liveNames, `resetLiveSymbols`, `setLiveSymbols`, `closeEventSource`, `ghidraDisconnect`, `ghidraConnect`, `ghidraLoadFunctions`, `ghidraOpenFunction`, `ghidraSyncToGhidra`, `applySymbolOverlay`→thay bằng liveNames (D8), `flashAddress` (giữ, nhẹ), `updateSymbolsAtAddress`, `refreshSymbolsAtAddress`, `ghidraStartEvents` (SSE + session guard), `ghidraResyncSymbols`, `ghidraHandleEvent`, `saveRecentUrl/loadRecentUrls` (key `pcode.ghidra.recent` + `pcode.ghidra.url` — giữ nguyên), `initGhidra`. |
| `js/ui/notes-anchor.js` | 358 | **PORT** → `src/notes/anchors.js` | **Nguyên văn**: REF_OFFSETS, NOTE_STOP, `liveRenameMap` (đọc ghdr.symByText + srcScope → Map), `liveNameOf`, `makeRenameRe`, `applyRenameMap`, `collectRenameMap`, `applyRenamesToNotes`, `displayCodeOf`, `syncNotesToGraph`, `splitUnanchorable`, `orphanEntries`, `reanchorNotes` (đồng bộ tên + đóng card orphan + reposition), `shiftBlockRef`, `refNum`, `noteIdTokens`, `detectRefOffset`, `shiftRefsInText`, `applyRefOffset`. |
| `js/ui/notes-store.js` | 415 | **PORT** → `src/notes/store.js` | Nguyên văn: `NOTES_LS_KEY='pcode.notes'`, `NOTES_MAX_BYTES=2MB`, `NOTES_MAX_ENTRIES=8`, `stripJsonFence`, `validateNotesJson`, `currentFnKey`, `emptyNotesStore`, `notesStoreRead/Write` (quota fallback), `saveNotes`, `loadSavedNotes`, `isPlausibleMatch`, `detachNotes`, `syncNotesWithGraph`, `clearNotes`, `dropSavedNotesForCurrentSource`, `importAINotes`. |
| `js/ui/notes-ai.js` | 411 | **PORT** → `src/notes/ai.js` | **Nguyên văn**: `AI_NOTES_VERSION=1`, `AI_PROMPT_HEAD` (copy nguyên văn ~60 dòng), `AI_PROMPT_SCHEMA` (copy nguyên văn), `redactHex`, `aiSymbolTable`, `computeBlockRole`, `edgeHintText`, `exportAIData`, `aiDataJson`, `aiPromptText`, `downloadAIData`, `copyAIPrompt` (clipboard + fallbackCopy), `tryApplySingleNote`, `notePromptFor`, `copyNotePrompt`. |
| `js/ui/notes-card.js` | 809 | **PORT** → `src/notes/NotesCard.jsx` + `NoteCardNode` | Giữ: `NOTES_MODES`, `NOTE_STATE_LABEL`, `NOTE_PANEL_W=292`, `NOTE_GAP=12`, `noteMeasureHost`/`getNoteMeasureHost`, `estimateNoteDims`, `measureNotePanel`, `estimateCardDims`, `measureNoteCard`, `noteReserve` (→ store), `prepareNoteReserves`, `openNoteAnchor`/`noteCardSlot` (→ NoteCardNode), `noteEdit` (✎ manual — lưu `manual:true`), reposition (→ RF node 'card'), `reopenCard`, `renderNotes` (gọi renderNotesHud/panel/card), `closeOpenNote`, `initNotes` (mode cycle phím N). |
| `js/ui/notes-panel.js` | 285 | **PORT** → `src/notes/NotesPanel.jsx` | Prose panel: sentences/sideEffects/unknowns checklist, hover glow tím → highlight refs, click nhảy tới block (centerNode), renderProsePanel. |
| `js/ui/notes-hud.js` | 220 | **PORT** → `src/notes/NotesHud.jsx` | HUD: 3 nút mode (Tắt/Badge/Đầy đủ), đếm ✓/⚠/✗ (blocks + edges), tên hàm, nút 📖/🗑; phím N cycle. |
| `js/ui/main.js` | 758 | **THAY** → `src/main.jsx` + `src/App.jsx` + store actions | Giữ: SAMPLE (copy nguyên văn), `updateLineNumbers` (errLine đỏ), `build()` queue logic (buildPending/isBuilding/finally), loadState/saveState (migrate, §4 SPEC), initSplitter (sideW), theme toggle + invalidateEdgeDefs→bỏ, `initDragDrop` (drag-drop file .c/.txt…, cap 2MB, ext whitelist), hotkeys (Ctrl+Enter, Ctrl+Shift+Enter, Ctrl+S/O/F/1, F, 1, +/-, arrows, Esc, N, F2, ?), auto-save src 10s (requestIdleCallback), `window.__pcode` (giữ y hệt, §8.3 SPEC), btn* bindings. |

## C. HTML/CSS/build

| File | Dòng | Hành động |
|---|---|---|
| `index.html` | 258 | **THAY** → Vite `index.html` (root #app, theme pre-script giữ, `<script type="module" src="/src/main.jsx">`). Toàn bộ DOM → JSX components. |
| `css/style.css` | 712 | **PORT** → `src/styles/app.css` (xem SPEC §8.4) |
| `build.mjs` | 52 | **XOÁ** (Vite build thay; bỏ standalone/min.html) |
| `pcode-grapher.standalone.html` / `pcode-grapher.min.html` | — | **XOÁ** (git history giữ) |
| `js/lib/elk.bundled.js` | 1,6MB | **XOÁ** (npm elkjs 0.12.0 — đã verify byte-identical với npm dist) |
| `PROMPT-AI-NOTES.md` | — | **GIỮ NGUYÊN** |
| `ui-new.png` | — | **GIỮ** (README mới dùng) |
| `LICENSE` | — | **GIỮ** |
| `README.md` | — | **VIẾT LẠI** ở cuối (task T11): cập nhật cách chạy (npm install/dev/build), bỏ mọi đoạn "mở file://", giữ changelog + thêm mục v2.0 |
| `ghidra-plugin/**` (Java, gradle, dist/*.zip) | — | **GIỮ NGUYÊN — KHÔNG SỬA, KHÔNG BUILD LẠI** |
| `ghidra/PcodeGrapherBridge.py` | — | **GIỮ NGUYÊN** (tham khảo contract cho mock_bridge) |

## D. Tests (repo cũ = STUB — chuyển thành test THẬT)

> Danh sách dưới đây đã đối chiếu với `tests/` của repo chính (30 file + fixtures).

| File cũ | Hành động | Ghi chú |
|---|---|---|
| `tests/test.js` | **THAY** → `tests/core/*.test.js` (vitest) | Comment stub là spec hành vi — NHƯNG số 25 node/33 cạnh trong đó đã LỖI THỜI, đo thật là 27/36 (guard clause fix 1.2.0; guard clause fix 1.2.0; dedupe bug 4.1…) — viết test thật theo đó |
| `tests/smoke.js` | **THAY** → `tests/ui/*.test.jsx` | 20 asserts cũ (render, search, minimap 27 rect, pan, splitter, LR, hlClear, bug-injection) → @testing-library/react |
| `tests/notes-jsdom.js` | **THAY** → `tests/notes/*.test.js` | 81+ checks (phase 2–5 trong comment) → test thật; dùng `tests/fixtures/ai-real-offbyone.json` + `demo-notes-old.session.json` |
| `tests/notes-stage.js` | **THAY** → `tests/notes/card.test.jsx` | 12 checks: card không đè block, edge endpoint trên biên block → RF: card node không đè, NoteCardNode vị trí |
| `tests/notes-sync.js` | **THAY** → `tests/notes/sync.test.js` | Đồng bộ tên biến alpha→beta (comment smoke cũ có kịch bản) |
| `tests/anchors.js` | **THAY** → `tests/core/anchors.test.js` | matchBlocks 3 pass, jaccard, skeleton bất biến rename |
| `tests/encoding.js` | **THAY** → `tests/core/encoding.test.js` | UTF-8/việt hoá qua lexer/parser/export |
| `tests/regression.js` | **THAY** → `tests/core/regression.test.js` | Lỗi từng sửa theo changelog (fix 1.2.0, 4.1…) |
| `tests/fix-regression.js` | gộp vào `tests/core/regression.test.js` | — |
| `tests/core-node.js` | **XOÁ** (đã verify: parser không dùng DOM) | Nội dung → ghi chú trong core test |
| `tests/inline-html.js` | **XOÁ** | Inline HTML đã verify → không còn cấu trúc cũ |
| `tests/stress.js` | **THAY** → `tests/graph/stress.test.js` | stress nhẹ 600 phần tử (jsdom); 1.600 phần tử đo ở T11 benchmark |
| `tests/mem-leak.js` | **THAY** → `tests/ui/memleak.test.jsx` | Chuyển hàm 10 lần → card/HUD cũ bị gỡ khỏi DOM |
| `tests/_mem_pptr.js` | **XOÁ** | Cần puppeteer thật — không có trong CI mới |
| `tests/qa*.js` (qa4, qa6, qa7, qa8, qa9, qa10, qa-browser, qa-encoding, qa-regression) | **GOM** → test mới | Đọc comment từng file, chuyển kỳ vọng đã verify thành test thật tương ứng (parser/encoding/regression); qa-browser (cần trình duyệt thật) → bỏ, giữ lại nếu có giá trị làm e2e manual |
| `tests/ghidra-live.js`, `tests/sync-live.js`, `tests/sync-jsdom.js` | **THAY** → `tests/ghidra/*.test.js` | Contract HTTP/SSE với mock_bridge |
| `tests/mock_bridge.js` | **PORT NGUYÊN VẠN** → `tests/mock_bridge.js` | Giữ CJS (vitest xử lý) hoặc chuyển ESM; endpoints + `/api/test/*` rename/syncFunction triggers giữ; env `PORT`/`BRIDGE_TOKEN`/`TOOL_DIR` giữ |
| `tests/gen-demo-session.js` | **GIỮ** | Sinh fixture session (đã có sẵn 2 file trong fixtures/) |
| `tests/fixtures/*.json` | **GIỮ** | `ai-real-offbyone.json` + `demo-notes-old.session.json` |

> 📌 Chú ý: các file test cũ đều `process.exit(0)` sau khi in "ĐÃ VERIFY" — KHÔNG phải test chạy được.
> Chúng là **tài liệu hành vi đã kiểm chứng**; nhiệm vụ là viết lại thành test thật đạt cùng kỳ vọng.
