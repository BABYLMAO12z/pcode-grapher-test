# FEATURES — 19 nhóm tính năng: cách port + tiêu chí nghiệm thu

> Mỗi nhóm: **Nguồn** (file cũ) · **Cách port** · **Acceptance** (tất cả phải ✓ thì task mới hoàn thành).
> Thứ tự này khớp TASKS.md.

---

## F1. Editor + line numbers + nạp file
- **Nguồn:** `index.html` (#src, #lineNums, #btnSample, #btnClear, #btnLoad), `main.js` (updateLineNumbers, initDragDrop, auto-save 10s).
- **Port:** `SourceEditor.jsx` — textarea + cột số dòng đồng bộ scroll; `errLine` → span đỏ (`class="err"`); nút Sample (SAMPLE nguyên văn) / Clear (xoá graphData/lastParsed/expanded/manualPos/setSourceScope('')/hlKeys/notes — theo main.js) / Open (file input, ext whitelist, cap 2MB); drag-drop file vào editor/board; auto-save src 10s qua requestIdleCallback.
- **Acceptance:**
  - [ ] Dán code → Ctrl+Enter → graph vẽ; số dòng khớp textarea khi scroll.
  - [ ] Code có lỗi parse → dòng lỗi tô đỏ + warning hiện #warn.
  - [ ] Sample nạp đúng hàm mẫu `activation::check`; Clear về trống (Export sau Clear không xuất gì).
  - [ ] Kéo-thả file .c/.txt nạp được; file >2MB hoặc ext lạ → toast từ chối.
  - [ ] Reload trang → src cũ tự về (persist).

## F2. Build pipeline + warnings
- **Nguồn:** `main.js` build(), `graph.js` renderGraph.
- **Port:** store `build()` — lex → parse → CfgBuilder → đo node → layout → rfNodes/rfEdges → syncNotesWithGraph → parseMsgs.
- **Acceptance:**
  - [ ] Sample → đúng **27 nodes / 36 edges** (đo thật trên core v1.9.3, warnings rỗng). *(số cũ 25/33 trong comment stub `tests/test.js` là LỖI THỜI — đo thật v1.9.3: 27/36, khớp README gốc dòng 297)*
  - [ ] File nhiều hàm → warning "file có N hàm — chỉ vẽ hàm \"X\" (hàm kế tiếp ở dòng Y)".
  - [ ] Parser lỗi → "⚠ Parse error: …"; lỗi render → "⚠ Render error: …"; lỗi notes KHÔNG phá build (toast riêng).
  - [ ] Build chồng (bấm Build liên tục khi ELK đang chạy) → render cuối cùng thắng, không path/nút mồ côi.
  - [ ] Statusbar: `N blocks · M edges`.

## F3. Block rendering (custom node)
- **Nguồn:** `graph.js buildNodeEl`, `tokens.js`, `state.js`, `css/style.css .node .ln-* .tk .tag`.
- **Port:** `CfgNode.jsx` — class `node k-<kind> c-<ctag> terminal tail`; mỗi dòng `<div class="ln …">`; token `<span class="tk …" data-key>` (giữ màu: kw #ff7b72, ty #79c0ff, fn #d2a8ff, gop #ff9e64, addr #56d4dd, num #e3b341, str #a5d6ff, com xám, lbl #e3b341; var = varColor FNV-1a); nền `ln-ctl`/`ln-seq` (bar trái 3px); tag `B# · ENTRY`; terminal viền xanh; cond nền đặc biệt; label vàng.
- **Acceptance:**
  - [ ] Mỗi biến một màu ổn định (hash tên); tắt "Màu theo biến" → var về màu mặc định.
  - [ ] Block đầu = `B1 · ENTRY` chứa chữ ký + code (KHÔNG còn ô chữ ký riêng — hành vi 1.9.3).
  - [ ] Tag = B# khớp note/AI data (B1 = block đầu tiên đếm tay).
  - [ ] Click token → highlight khớp (xem F6).

## F4. Collapse block dài
- **Nguồn:** `state.js` (COLLAPSE_AT=24, HEAD_L=14, TAIL_L=3, collapsibleBlock), `actions.js` (toggleExpand), `css .more .coll`.
- **Port:** trong CfgNode — block >24 dòng: hiện 14 đầu + 3 cuối + dòng `▾ mở rộng — đang ẩn N dòng` / `▴ thu gọn (N dòng)`; bấm → toggle `expanded[id]` → **đo lại + layout lại** (như cũ).
- **Acceptance:**
  - [ ] Block dài tự gập; bấm mở rộng thấy đủ dòng; bấm thu gọn lại.
  - [ ] Đổi preset/hướng sau khi mở rộng → vị trí mới đúng, trạng thái expanded giữ (cùng scope).
  - [ ] Export SVG/PNG tôn trọng trạng thái gập (chỉ xuất dòng hiển thị — visibleLinesOf).

## F5. Pan/zoom/minimap/theme/preset/rankdir
- **Nguồn:** `view.js`, `minimap.js`, `main.js` (btnDir/selPreset/optVars/btnTheme), `state.js` PRESETS/EDGE_PALETTES.
- **Port:** RF có sẵn pan/zoom (min 0.1 / max 8), `fitView`, MiniMap + toggle, Controls; preset → layout lại (keepView); rankdir TB/LR; theme dark/light (class 'light' + màu lại).
- **Acceptance:**
  - [ ] Lăn zoom (tâm chuột), kéo pan, dbl-click block zoom tới, dbl-click nền fit, F fit, 1 = 100%, +/− zoom, ←→↑↓ pan.
  - [ ] Preset compact/normal/wide đổi mật độ; rankdir ↕ TB / ↔ LR đổi hướng; cả hai giữ vị trí block kéo tay (manualPos) và keepView.
  - [ ] Theme 🌙/☀️ đổi màu toàn bộ (block/edge/minimap); lưu `pcode.theme`; không nháy khi load (pre-script).
  - [ ] Minimap bật/tắt 🗺; khung viewport theo pan/zoom.
  - [ ] Zoom % hiển thị đúng ở toolbar + statusbar.

## F6. Highlight giống IDA (click token + ô search)
- **Nguồn:** `search.js`, `interact.js` (click token), `css .lit .dimmed .solo`.
- **Port:** `hlKeys` Set trong store; click token → toggle key (Ctrl+click = multi); ô search: case Aa / regex .* / word \b / solo "Chỉ hiện khớp", Enter next / Shift+Enter prev + `1/9`; dim phần còn lại khi bật "Làm mờ"; Esc xoá; `applyHighlights` tính lit/dimmed cho node+edge (map `hlOf` trong store để CfgNode/CfgEdge tự đọc, không đổi tham chiếu rfNodes).
- **Acceptance:**
  - [ ] Click biến trong block A → mọi token cùng tên (mọi block + cả note text) sáng, phần còn lại mờ (nếu bật dim); click lần nữa → bỏ.
  - [ ] Ctrl+click nhiều key; Esc bỏ hết; hiển thị `N/M` khi điều hướng kết quả.
  - [ ] Search regex `FUN_.*` đúng; word `\b` đúng; solo chỉ hiện block khớp (ẩn block khác).
  - [ ] Highlight còn giữ sau: đổi preset, đổi hướng, đổi theme, rebuild (applyHighlights sau mỗi render — hành vi 1.8.0).
  - [ ] Hover block KHÔNG làm mờ gì (auto-hover đã tắt từ 1.8.0).

## F7. Click/drag chuột trên block & edge
- **Nguồn:** `interact.js`, `hover.js`, `arrange.js`, `actions.js` (copyBlock).
- **Port:** RF handlers: `onNodeClick` (ghim focus), `onEdgeClick` (focus edge + 2 block đầu cuối), `onPaneClick` (bỏ focus), `onNodeContextMenu` (click phải = copy code block → clipboard), dbl-click node (zoom tới), `onNodeDragStop` (lưu manualPos).
- **Acceptance:**
  - [ ] Click edge → edge + 2 block nổi bật, phần còn lại mờ; click nền → bỏ.
  - [ ] Click block → ghim focus (mờ phần còn lại); Esc → bỏ.
  - [ ] Click phải block → copy code block (text thuần, đúng dòng) + toast.
  - [ ] Kéo block → vị trí mới giữ khi đổi preset/hướng/theme (cùng nguồn); đổi code → reset vị trí (scope).
  - [ ] Không có ghost/vệt bóng; safe mode tắt transition/shadow.

## F8. Keyboard + hotkey overlay
- **Nguồn:** `main.js` (keydown), `index.html` #keyOverlay.
- **Port:** global keydown (bỏ qua khi focus trong textarea/input, trừ Ctrl+Enter/Ctrl+S/O/F/1): F fit, 1 100%, +/− zoom, ←→↑↓ pan, N cycle notes mode, F2 debug, ? overlay, Ctrl+Enter build, Ctrl+Shift+Enter build+fit, Ctrl+S session, Ctrl+O import, Esc (đóng card → bỏ chọn → clear highlight — thứ tự như cũ).
- **Acceptance:**
  - [ ] Mọi phím trên hoạt động đúng; gõ trong ô code không bị nuốt (trừ tổ hợp đã khai).
  - [ ] `?` hiện overlay; Esc đóng overlay trước, rồi card, rồi highlight (thứ tự như notes-card cũ).

## F9. Exporter PNG/SVG/Debug
- **Nguồn:** `exporter.js` toàn bộ.
- **Port:** `exportSVGFile` (buildExportSVG giữ nguyên: rect + tspan tô màu token, mũi tên marker, nền theme, KHÔNG foreignObject; tag B#; collapse tôn trọng), `exportPNG` (html-to-image: fitView → chụp `.react-flow` container, pixelRatio 2, cap 8192px; nếu lỗi → toast "hãy thử SVG"), `exportDebugData` (JSON logic graph).
- **Acceptance:**
  - [ ] SVG mở được, đúng màu token, đúng B#, đúng T/F/goto/case nhãn, nền theo theme.
  - [ ] PNG tải được, rõ chữ (không mờ), màu khớp; graph lớn vẫn không vượt 8192px.
  - [ ] Export sau khi gập block → chỉ dòng hiển thị; sau khi kéo block → đúng vị trí kéo.
  - [ ] Debug export ra JSON có nodes/edges/warnings.

## F10. Session save/load
- **Nguồn:** `main.js` __pcode.sessionData/exportSession/importSession, tests/fixtures/demo-notes-old.session.json.
- **Port:** `sessionData()` shape GIỮ NGUYÊN `{src, manualPos, expanded, hlKeys, rankdir, preset, colorVars, theme, notes, notesMode}`; export = download pcode-session.json; import = đọc + áp + setSourceScope + build + applyHighlights + toast.
- **Acceptance:**
  - [ ] Save → file JSON đúng shape; Load lại file đó → graph/notes/layout/highlight về đúng.
  - [ ] Import được **file session CŨ** (demo-notes-old.session.json) → không crash, notes hiện đúng trạng thái (ok/stale/orphan theo anchor).
  - [ ] Ctrl+S / Ctrl+O hoạt động.

## F11. Ghidra Live (kết nối + duyệt hàm + decompile)
- **Nguồn:** `ghidra.js` (ghidraConnect/LoadFunctions/OpenFunction/SyncToGhidra), `index.html` panel GHIDRA LIVE.
- **Port:** SidePanel section: URL (default `http://127.0.0.1:8765`) + token + Kết nối/Ngắt/⇄ Đồng bộ + status (offline/đang kết nối/đã kết nối/lỗi) + ô lọc + `<select>` hàm (size 7). Các nút ngoài (Save/Load URL gần đây, tool-dir mode) port nếu có trong ghidra.js cũ.
- **Acceptance (dùng mock_bridge):**
  - [ ] Kết nối đúng URL+token → status xanh, danh sách hàm hiện (lọc hoạt động).
  - [ ] Chọn hàm → decompile → graph vẽ đúng hàm (so với /api/decompile).
  - [ ] Sai URL/token → thông báo lỗi rõ + gợi ý kiểm tra /api/health.
  - [ ] ⇄ Đồng bộ gọi /api/goto với address hàm đang xem.

## F12. Symbol live + SSE rename (Ghidra ⇄ graph)
- **Nguồn:** `ghidra.js` (applySymbolOverlay, ghidraStartEvents, updateSymbolsAtAddress, refreshSymbolsAtAddress, flashAddress), `notes-anchor.js` liveRenameMap.
- **Port:** SSE `/events` → `symbolRenamed`/`symbolChanged`/`syncFunction` → cập nhật `ghdr.symByText/addrToTexts` → `liveNames` Map → CfgNode/CfgEdge/notes/export đọc liveNames (D8). `syncFunction` (Ghidra→tool): decompile + vẽ hàm mới.
- **Acceptance:**
  - [ ] Đổi tên symbol trong mock bridge (trigger /api/test/rename) → token graph đổi tên NGAY (không rebuild), có flash.
  - [ ] Rebuild (đổi preset) → tên live KHÔNG mất (bug 1.9.3 đã sửa).
  - [ ] Note text + card + 📤 AI data dùng tên live (không phải FUN_xxx).
  - [ ] `syncFunction` event → tool tự chuyển + vẽ hàm đúng.

## F13. AI Notes — export data/prompt
- **Nguồn:** `notes-ai.js` (exportAIData/aiDataJson/aiPromptText/downloadAIData/copyAIPrompt/notePromptFor/copyNotePrompt).
- **Port:** nguyên văn (SPEC §8.2). Toolbar: 📤 AI data (Shift+click = redact) tải JSON; 📋 AI prompt copy (đếm KB + số block); card có 📋 prompt 1 note (ask/regen).
- **Acceptance:**
  - [ ] JSON export đúng schema; `ref` chạy B1..Bn đúng `refRange`; code dùng tên live; `fromCond`/`toPreview` đầy đủ; redact ẩn hex ≥4 chữ số, giữ 0x10/0x1e7z.
  - [ ] Prompt = AI_PROMPT_HEAD + SCHEMA + DỮ LIỆU (copy nguyên văn, không cắt).
  - [ ] Với sample 27 node → đủ 27 blocks + 36 edges trong export.

## F14. AI Notes — import + re-anchor + rename sync
- **Nguồn:** `notes-store.js` (importAINotes, syncNotesWithGraph…), `notes-anchor.js` (reanchorNotes, detectRefOffset…), `core/anchors.js`.
- **Port:** nguyên văn. Ô paste JSON (modal), Ctrl+Enter nạp; tự cắt ```json fence; validate schema; detectRefOffset ±1 (fixture ai-real-offbyone.json là test chuẩn); reanchor 3-pass; đồng bộ tên biến (alpha→beta); note lưu theo hàm LRU 8; note ✎ sửa tay không bị ghi đè; notes tự về khi mở lại đúng hàm.
- **Acceptance:**
  - [ ] Import file AI trả về (JSON đầy đủ) → badge ✓ trên block khớp, note đúng chỗ, toast "Đã nạp N note".
  - [ ] Import JSON lệch +1 (fixture offbyone) → TỰ dịch về đúng (không còn ✗ rải khắp).
  - [ ] Sửa code (đổi tên biến) rồi Build → note bám đúng block + text đổi tên theo (toast "Đã đồng bộ tên biến trong N note").
  - [ ] Đổi hàm → note hàm cũ gỡ khỏi graph; quay lại → tự về; sang hàm khác → notes riêng.
  - [ ] Paste 1-note JSON `{"ref":"B3","note":"…"}` → áp đúng note đó.
  - [ ] Note ngoài B1..Bn → ✗ orphan, KHÔNG tự dán vào block bừa.

## F15. AI Notes — card + HUD + panel + main path
- **Nguồn:** `notes-card.js`, `notes-hud.js`, `notes-panel.js`.
- **Port:** HUD (Tắt/Badge/Đầy đủ + ✓/⚠/✗ blocks&edges + tên hàm + 📖 + 🗑); card (header sticky ✕, chips Bxx bấm được, code preview live, note ✎ sửa, nút 📋 prompt / ✓ nạp 1 note, footer dính); nét nối đứt tím block↔card (NoteCardNode + edge 'noteConn'); panel 📖 (sentences + sideEffects + unknowns checklist, hover glow tím, click nhảy ref); 🧭 main path (refs từ summary, fallback plain/true từ entry, guard khi đang search); phím N cycle. Card kéo được qua HEADER (`dragHandle:'.nc-head'`); THÂN card bôi đen/select text được như 1.9.3 (interact.js loại #noteLayer khỏi gesture board) — kèm chuột phải trong card/ô note hiện menu native (Copy…); right-click block cfg = copy code; wheel trên card/ô note = cuộn nội dung, không zoom (`nowheel`).
- **Acceptance:**
  - [ ] Phím N: off → badge → full → off; HUD phản ánh đúng + đếm đúng.
  - [ ] Click block/edge → card mở cạnh block, KHÔNG đè block nào; Esc đóng card trước rồi mới bỏ focus.
  - [ ] Card khi pan/zoom đi theo block; nét nối vẽ lại đúng.
  - [ ] Sửa note trong card → dấu ✎, không bị re-import ghi đè, lưu vào pcode.notes.
  - [ ] Chips Bxx trong card click → nhảy tới block (center).
  - [ ] 📖 panel hiển thị đúng số câu; hover câu → block liên quan sáng tím; 🧭 tô đậm luồng chính; khi đang search không bật 🧭.
  - [ ] Demo: Load `demo-notes-old.session.json` → thấy UI note đầy đủ không cần AI (hành vi 1.9.3).

## F16. Debug HUD + safe mode
- **Nguồn:** `debug.js`, `css #dbg`, main.js (F2).
- **Port:** DebugPanel: FPS, counters, log (40 event gần nhất), state snapshot, 📋 Copy debug info, ⛔ Kill stuck, 🔁 Rebuild, ⚡ safe mode (tắt transition/shadow, persist).
- **Acceptance:**
  - [ ] F2 mở/đóng; số liệu cập nhật khi tương tác; Copy ra JSON dán được.
  - [ ] Kill stuck xoá trạng thái kẹt (pan/zoom không kẹt sau đó).
  - [ ] Safe mode lưu; bật → không transition/shadow.

## F17. Toast + statusbar + netStatus
- **Nguồn:** `actions.js` toast, `index.html` #statusbar/#netStatus.
- **Port:** Toast queue (aria-live polite, tự biến mất); statusbar: stats + zoom% + hint phím tắt; netStatus: offline / Ghidra Live · đã kết nối / lỗi.
- **Acceptance:** Toast hiện/ẩn đúng thời điểm các hành động (build, export, import, ghidra…); statusbar đúng số liệu.

## F18. Splitter + responsive + a11y
- **Nguồn:** `main.js` initSplitter, `css` media queries, `index.html` (skip-link, aria).
- **Port:** splitter kéo đổi rộng panel trái (min 280, max 72%, dbl-click reset 430px, persist pcode.sideW); responsive hẹp (panel lên trên, ẩn minimap); role/aria/skip-link giữ.
- **Acceptance:** Kéo splitter → panel đổi, reload giữ; màn hẹp bố cục dùng được; keyboard navigate được các nút chính.

## F19. `window.__pcode` API + README mới
- **Nguồn:** main.js cuối.
- **Port:** expose y hệt (SPEC §8.3). Cuối cùng: viết README mới (npm install/dev/build/test, mô tả chức năng, changelog v2.0), giữ PROMPT-AI-NOTES.md, cập nhật tài liệu Ghidra (cách chạy dev với vite proxy).
- **Acceptance:**
  - [ ] Gọi từ console: `__pcode.build()`, `__pcode.exportAI(true)`, `__pcode.notesState()`, `__pcode.sessionData()`, `__pcode.importSession(json)` hoạt động như cũ.
  - [ ] README mới đủ bước chạy; không còn nhắc file://.
