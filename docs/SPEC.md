# SPEC — Kiến trúc đích (v2.0, React)

> AI viết mã phải tuân thủ spec này. Mọi thay đổi lớn phải báo cáo, không tự ý.

---

## 1. Cây thư mục đích

```
pcode-grapher/
├─ index.html                     ← Vite entry (root div#root, theme pre-script giữ nguyên)
├─ vite.config.js                 ← plugin-react + proxy /api, /events → http://127.0.0.1:8765
├─ package.json                   ← scripts: dev / build / preview / test / lint / format
├─ eslint.config.js, .prettierrc  ← chuẩn mới (không có ở bản cũ — tự thêm)
├─ src/
│  ├─ main.jsx                    ← createRoot + import style
│  ├─ App.jsx                     ← layout: SidePanel | splitter | FlowView (+Toolbar, StatusBar, Toast, Overlays)
│  ├─ core/                       ← ⚠️ PORT NGUYÊN DẠNG từ js/core (ES module + export)
│  │  ├─ lexer.js                 ← export { lex }
│  │  ├─ parser.js                ← export { parseFunction, fnNameOf }
│  │  ├─ cfg.js                   ← export { CfgBuilder }
│  │  ├─ colors.js                ← export { classifyId, varColor, isGhidraOp, isTypeWord, KEYWORDS, TYPE_WORDS }
│  │  ├─ anchors.js               ← import { KEYWORDS, isGhidraOp } từ colors.js; export { fnv1a, skeletonOf, nodeAnchors, buildAnchors, buildEdgeAnchors, jaccard, linesScore, matchBlocks, matchEdges }
│  │  └─ index.js                 ← export const PcodeCore = { lex, parseFunction, CfgBuilder, classifyId, varColor, KEYWORDS, TYPE_WORDS, buildAnchors, buildEdgeAnchors, matchBlocks, matchEdges, fnv1a }
│  ├─ store/
│  │  ├─ useStore.js              ← zustand store (xem §3)
│  │  └─ persistence.js           ← migrate + đọc/ghi key cũ pcode.* (§4)
│  ├─ graph/
│  │  ├─ layout.js                ← buildFlowGraph() → { nodes, edges } RF format; ELK↔dagre switch; đo node bằng DOM ẩn (§5)
│  │  ├─ CfgNode.jsx              ← custom node: block + note text (full) + badge + tag B# (§6)
│  │  ├─ CfgEdge.jsx              ← custom edge: màu theo kind, label T/F/case/goto/↺, dashed cho false/case (§6)
│  │  ├─ NoteCardNode.jsx         ← node đặc biệt cho card note + edge nối đứt nét (D7)
│  │  └─ FlowView.jsx             ← <ReactFlow> + <MiniMap> + <Controls> + on* handlers + note layer
│  ├─ notes/
│  │  ├─ anchors.js               ← PORT NGUYÊN DẠNG js/ui/notes-anchor.js (rename sync, detectRefOffset…)
│  │  ├─ store.js                 ← PORT NGUYÊN DẠNG js/ui/notes-store.js (LRU 8 hàm, pcode.notes)
│  │  ├─ ai.js                    ← PORT NGUYÊN DẠNG js/ui/notes-ai.js (AI_PROMPT_HEAD/SCHEMA, exportAIData…)
│  │  ├─ NotesHud.jsx             ← HUD: Tắt/Badge/Đầy đủ + đếm ✓/⚠/✗ + tên hàm
│  │  ├─ NotesCard.jsx            ← card note (chips Bxx, code preview live, sửa tay)
│  │  └─ NotesPanel.jsx           ← 📖 prose panel + 🧭 main path
│  ├─ ghidra/
│  │  └─ bridge.js                ← PORT NGUYÊN DẠNG js/ui/ghidra.js (logic; DOM → store)
│  ├─ ui/
│  │  ├─ SidePanel.jsx            ← editor + line numbers + build buttons + search + legend + hint
│  │  ├─ SourceEditor.jsx         ← textarea + #lineNums (đồng bộ scroll, errLine đỏ)
│  │  ├─ SearchBar.jsx            ← ô highlight + case/regex/word/solo + prev/next + info
│  │  ├─ Toolbar.jsx              ← zoom/fit/PNG/SVG/AI data/AI prompt/Notes/📖/🧭/Save/Load/debug
│  │  ├─ DebugPanel.jsx           ← Debug HUD (FPS, counters, log, kill, safe mode, copy)
│  │  ├─ Toast.jsx                ← toast queue
│  │  ├─ HotkeyOverlay.jsx        ← phím tắt (?)
│  │  ├─ exporter.js              ← buildExportSVG (port) + exportPNG (html-to-image) + exportDebugData
│  │  └─ tokens.js                ← PORT NGUYÊN DẠNG js/ui/tokens.js (esc, needSpace, renderToks, lineHTML, lineClass, lineText, plainToks)
│  ├─ styles/
│  │  └─ app.css                  ← port css/style.css (bỏ phần #stage/#zoom/minimap/edge thủ công; thêm style React Flow)
│  └─ lib/                        ← KHÔNG CÓ — dùng npm (elkjs, @dagrejs/dagre)
├─ tests/
│  ├─ setup.js                    ← stub ResizeObserver, DOMMatrixReadOnly, matchMedia, scrollTo…
│  ├─ mock_bridge.js              ← PORT NGUYÊN DẠNG tests/mock_bridge.js (contract Ghidra, dev tool)
│  ├─ core/                       ← vitest: lexer/parser/cfg/colors/anchors (+fuzz 5.000 graph)
│  ├─ graph/                      ← layout switch, RF mapping, collapse, scope
│  ├─ notes/                      ← reanchor, offset detect, rename sync, LRU, import JSON
│  ├─ ghidra/                     ← contract với mock_bridge (health/functions/decompile/resolve/goto/SSE)
│  └─ ui/                         ← @testing-library/react: build, search, notes card, session
├─ ghidra-plugin/                 ← ⚠️ GIỮ NGUYÊN (không sửa)
├─ ghidra/PcodeGrapherBridge.py   ← ⚠️ GIỮ NGUYÊN
├─ PROMPT-AI-NOTES.md              ← GIỮ NGUYÊN (ghi chú prompt; nguồn thật ở src/notes/ai.js)
└─ ui-new.png                     ← GIỮ (README mới dùng lại)
```

## 2. Dependencies (phiên bản đã kiểm tra npm registry 01/09/2026)

```jsonc
"dependencies": {
  "react": "^19.2.8",
  "react-dom": "^19.2.8",
  "@xyflow/react": "^12.11.6",
  "zustand": "^5.0.15",
  "elkjs": "^0.12.0",
  "@dagrejs/dagre": "^3.1.1",
  "html-to-image": "^1.11.13"
},
"devDependencies": {
  "vite": "^8.2.2",
  "@vitejs/plugin-react": "^6.1.1",
  "vitest": "^4.x",
  "jsdom": "^30.0.1",
  "@testing-library/react": "^16.3.3",
  "@testing-library/user-event": "^14.x",
  "@testing-library/jest-dom": "^6.x",
  "eslint": "^10.x", "eslint-plugin-react-hooks": "^7.x", "eslint-plugin-react-refresh": "^0.4.x",
  "prettier": "^3.x"
}
```

## 3. Store (zustand) — shape bắt buộc

```js
{
  // ---- nguồn & graph ----
  src: string,
  graphData: { nodes: CfgNode[], edges: CfgEdge[], warnings: string[] } | null,
  lastParsed: ParsedFunction | null,
  parseMsgs: string[],                       // warnings/errors hiện ở ô #warn
  renderSeq: number,                          // chống render cũ thắng render mới (port từ renderSeq cũ)
  building: boolean,
  // ---- options (persist) ----
  opts: { rankdir:'TB'|'LR', preset:'compact'|'normal'|'wide', colorVars:boolean, dim:boolean,
          safe:boolean, searchCase:boolean, searchRegex:boolean, searchWord:boolean,
          searchSolo:boolean, theme:'dark'|'light' },
  // ---- layout state ----
  rfNodes: RFNode[], rfEdges: RFEdge[],       // nodes/edges của React Flow (xem §6)
  layoutScope: string,                        // srcScopeOf(src) — manualPos/expanded theo scope
  manualPos: Record<nodeId,{x,y}>,            // kéo tay (persist theo scope)
  expanded: Record<nodeId,boolean>,           // block gập/mở (persist theo scope)
  // ---- highlight ----
  hlKeys: Set<string>, hlOrder: string[], hlIdx: number,
  // ---- notes ----
  notes: NotesData|null, notesMode: 'off'|'badge'|'full', openNoteKey: string|null, openNoteAnchor: object|null,
  mainPathOn: boolean, noteReserve: Record<nodeId,{w,h}>,
  // ---- ghidra (GHDR — giữ đúng tên field của js/ui/ghidra.js cũ) ----
  ghdr: { url, displayUrl, token, connected:boolean, program, currentAddress,
          symByText: Record<text,{addr,name,source,kind,type}>, addrToTexts: Record<addr,text[]>,
          evts: EventSource|null, debounce, session:number },
  // ---- ui ----
  ui: { dbgOpen, proseOpen, pasteOpen, sideW, toasts: {id,msg}[], safeMode, netStatus },
  // ---- actions ----
  build(keepView?), applyHighlights(), clearNotes(), … (danh sách đầy đủ trong FILE-MAP §main.js)
}
```

- Persist qua `zustand/middleware.persist`, `partialize` chỉ lấy: `{ src, opts }`.
  `notes` có cơ chế riêng (pcode.notes, LRU 8 — port nguyên văn notes-store.js).
  `manualPos/expanded` persist kèm `layoutScope`; khi load mà scope khác → bỏ (đúng hành vi cũ: adoptSourceScope).
- **Không** persist: graphData, rfNodes, hlKeys, ghdr.

## 4. Persistence & migrate (quyết định D11)

**Quyết định duy nhất:** GIỮ NGUYÊN key localStorage cũ, app mới đọc và ghi ĐÚNG các key đó — không tạo key mới, không xoá key cũ (người dùng quay lại bản cũ vẫn còn cấu hình).

| Key | Nội dung | Ghi chú |
|---|---|---|
| `pcode.src` | source code (persist 10s sau khi gõ) | rỗng → nạp SAMPLE (copy nguyên văn main.js cũ) |
| `pcode.opts` | JSON: `{rankdir, preset, colorVars, dim, safe, searchCase, searchRegex, searchWord, searchSolo, notesMode}` (9 field — đã verify trong main.js cũ) | port nguyên văn `loadState()/saveState()` |
| `pcode.theme` | `'light'` / `'dark'` | tôn trọng `prefers-color-scheme` nếu chưa có (như index.html cũ) |
| `pcode.sideW` | bề rộng panel trái (px) | — |
| `pcode.notes` | notes v2 `{v:2, byHash, order}` — LRU 8 hàm | giữ NGUYÊN key + format (notes-store.js port nguyên văn tự đọc/ghi) |
| `pcode.ghidra.url` | URL bridge hiển thị gần nhất | — |
| `pcode.ghidra.recent` | mảng URL gần đây | — |

- Migrate = đọc các key trên 1 lần lúc khởi động (store `onRehydrateStorage` hoặc trước render trong `main.jsx`); nếu key chưa tồn tại → giá trị mặc định. Không có "migrate v2" riêng vì format không đổi.
- `manualPos/expanded` (theo `layoutScope`): v1.9.3 **không** persist ra localStorage (chỉ giữ trong phiên và trong session file export/import) — bản mới cũng vậy, không thêm persist (tránh lệch vị trí khi code đổi).

## 5. Layout adapter (`src/graph/layout.js`)

Port từ `js/ui/graph.js` + `state.js` (PRESETS, COLLAPSE_AT=24, HEAD_L=14, TAIL_L=3, collapsibleBlock):

1. **Đo kích thước node** bằng DOM ẩn (giữ kỹ thuật cũ — 1 nguồn sự thật cho text):
   - Tạo hidden container (port `getNoteMeasureHost()` trong notes-card.js cũ, hoặc div `position:absolute;left:-9999px`).
   - Với mỗi CfgNode: đổ HTML từ `lineHTML(line, colorVars)` (port tokens.js) + class `lineClass` + phần `.coll`/`.more` nếu gập + tag B# → đo `offsetWidth/offsetHeight`.
   - Thêm phần note (mode full): `w += NOTE_GAP(12) + notePanelW(292)`; `h = max(h, notePanelH)` — port `measureNotePanel`/`estimateNoteDims` từ notes-card.js cũ.
2. **Layout engine:**
   - `nodes.length <= 400` → ELK (port nguyên văn `cfgToElkGraph()`: các layoutOptions giữ y hệt; dùng `import ELK from 'elkjs'`).
   - `> 400` → dagre: `new dagre.graphlib.Graph()`, `rankdir: rankdir==='LR'?'LR':'TB'`, `nodesep: PRESETS[preset].nodesep`, `ranksep: PRESETS[preset].ranksep`, node width/height từ bước 1; output `g.node(id)` → `{x - w/2, y - h/2}` (dagre trả tâm → đổi sang góc trái trên).
3. **manualPos**: nếu `manualPos[nid]` tồn tại → ghi đè position (giữ hành vi cũ).
4. **Output**: `{ nodes: RFNode[], edges: RFEdge[] }` (xem §6), bounds (cho fitView), và `statsText = n + ' blocks · ' + m + ' edges'`.
5. **Scope**: `adoptSourceScope(src)` port nguyên văn — src đổi → xoá manualPos/expanded. `setSourceScope` cho import session.
6. KHÔNG cần `snapEdgeEndsToBlocks` (React Flow tự route edge) — nhưng edge LABEL T/F/case/goto phải giữ (custom edge).

## 6. Mapping React Flow (quyết định D3/D7)

```js
// node block
{ id: 'n' + cfgNode.id, type: 'cfg', position: {x,y},
  data: { cfgNode, ref: 'B' + (i+1),           // rebuildNodeRefMap() port nguyên văn
          note: noteForNodeId,                  // text note (mode full) hoặc null
          state: 'ok'|'stale'|'orphan'|null,    // từ reanchor
          mainPath: boolean,                    // 🧭
          lit: boolean, dimmed: boolean,
          manualPos: bool } }
// node card (khi mở card note)
{ id: 'card', type: 'noteCard', position: <vị trí cạnh block> ,
  data: { ref, state, note, plain, liveNames } }
// edge nối card (nét đứt tím, có mũi tên) — NHƯ edge thường, type 'noteConn'
{ id: 'noteConn', source: 'n' + blockId, target: 'card', type: 'noteConn', data: {} }
// edge CFG
{ id: 'e' + idx, source: 'n' + e.from, target: 'n' + e.to, type: 'cfg',
  data: { kind: e.kind, elabel: e.elabel, note: edgeNote, state, mainPath, lit } }
```

- **CfgNode.jsx**: render block như `buildNodeEl()` cũ:
  - div `.node k-<kind> c-<ctag> terminal tail`, `.lit`, `.dimmed`, `.focus`, `.pl`
  - mỗi dòng: `<div class="lineClass(...)">` + `dangerouslySetInnerHTML` từ `lineHTML` **HOẶC** render token bằng component (khuyến nghị: component `<Tok>` thay cho dangerouslySetInnerHTML để click token dễ; nhưng phải giữ y hệt output text/khoảng cách — dùng `needSpace`).
  - token: `data-key` → click gọi `highlightKey(key, ctrl)`; hiển thị `liveNames.get(v) || v` (D8).
  - collapse: nếu `collapsibleBlock(n)` → slice HEAD_L / TAIL_L + nút `▾ mở rộng — đang ẩn N dòng` / `▴ thu gọn (N dòng)` (port actions.js `toggleExpand`).
  - tag: `B# · ENTRY` góc phải trên.
  - note full: cột note bên phải (gap 12px) — text chọn được, chuột phải không bị chặn (contextmenu không preventDefault trên note).
  - badge: `<span class="nb">✓|⚠|✗</span>` góc block; chấm trên edge.
  - `NodeResizer` KHÔNG dùng; `isConnectable={false}`; `draggable` = true (chỉ kéo phải → xem FEATURES F7).
- **CfgEdge.jsx**: dùng `BaseEdge` + `getSmoothStepPath` (hoặc `getBezierPath`); màu theo `EDGE_PALETTES[theme][kind]` (port state.js); label qua `EdgeLabelRenderer` (nhãn T/F/↺/goto/case…), dashed cho `false`/`case`; `.lit`/`.dimmed`/`.focus`/`.pl`; arrowhead màu theo kind (dùng markerEnd custom hoặc `MarkerType.ArrowClosed` với color).
- **FlowView.jsx**:
  - `<ReactFlow nodes={rfNodes} edges={rfEdges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
     fitView minZoom={0.1} maxZoom={8} nodesConnectable={false} elementsSelectable
     onNodeClick onNodeContextMenu onEdgeClick onPaneClick onMoveEnd onNodeDragStop
     onlyRenderVisibleElements={rfNodes.length > 400} proOptions={{hideAttribution:false}}>`
  - `<MiniMap>` + `<Controls>` (thay nút zoom cũ; giữ luôn nút 1:1/Fit trong Toolbar riêng vì UI cũ có).
  - Panel nền: Background dots (giữ cảm giác cũ) — tuỳ chọn.
  - `useReactFlow().fitView/zoomIn/zoomOut/setViewport` cho nút + phím tắt.
  - NoteCard: khi `openNoteKey` → thêm node 'card' + edge 'noteConn' vào rfNodes/rfEdges (tính vị trí card: node block + offset {w+24, 0} hoặc trên dưới tuỳ chỗ trống — port ý tưởng `repositionNoteCard()` cũ).
  - `applyHighlights()` (port search.js) → setState lit/dimmed trên data rồi re-render.
- **Chú ý hiệu năng**: `React.memo(CfgNode)`; `useCallback` cho handlers; không tạo object mới mỗi render cho toàn bộ nodes khi chỉ highlight đổi — tách `lit`/`dimmed` thành map riêng trong store và CfgNode tự đọc (`useStore(s => s.hlOf[nid])`) để RF nodes mảng không đổi tham chiếu khi highlight (tránh re-layout). Đây là yêu cầu bắt buộc để 1.200–1.600 phần tử mượt.

## 7. Build pipeline (`build()` trong store)

Port NGUYÊN VĂN luồng `main.js → build()`:

```
src → PcodeCore.lex → PcodeCore.parseFunction → parsed
   → if (parsed.errLine) tô dòng lỗi (lineNums)
   → builder.build(parsed) → graphData (giữ warnings)
   → đo node → layout (ELK/dagre) → rfNodes/rfEdges
   → syncNotesWithGraph() (port notes-store.js) → autoApply/renamed toasts
   → parseMsgs = extras + parsed.errors + graphData.warnings
   → statsText, saveState
```

- `building` + `renderSeq` port nguyên văn (chống build chồng, render cũ bị huỷ).
- `buildPending`/`drainBuildQueue` (bản chính dùng `if (isBuilding) { buildPending=true; return; }` + `finally` nhả cờ + gọi lại) — port y hệt.
- Ctrl+Enter / Ctrl+Shift+Enter (build + fit) / nút ▶ Build / Sample / Clear / Open — port main.js.

## 8. Contracts phải GIỮ NGUYÊN

### 8.1 Ghidra bridge (client) — port ghidra.js
- Endpoints: `GET /api/health`, `GET /api/functions?q=&limit=500`, `GET /api/decompile?address=`, `GET /api/resolve?addresses=`, `GET /api/goto?address=` (read-only), `GET /events` (SSE: `symbolRenamed`, `symbolChanged`, `syncFunction`, program change).
- `parseBridgeUrl` (tách token từ URL `?token=`), `bridgeUrl`, `ghidraFetch` (header token, `needsToken`), `saveRecentUrl/loadRecentUrls` (key `pcode.ghidra.recent` = mảng URL, `pcode.ghidra.url` = URL gần nhất — đã verify trong ghidra.js cũ).
- SSE events → cập nhật `ghdr.symByText/addrToTexts` → `liveNames` → re-render + `flashAddress`.
- `ghidraSyncToGhidra()` → `/api/goto` với `currentAddress`.
- Test dùng `tests/mock_bridge.js` (port nguyên văn, chạy port 8765, hỗ trợ `PORT`/`BRIDGE_TOKEN`/`TOOL_DIR` env).

### 8.2 AI Notes schema (export/import) — port notes-ai.js + notes-anchor.js
- `exportAIData(redact)` → JSON: `{ meta:{version:1, fn, header, headerHash, srcHash, stats{blocks,edges,chars,lines}, refRange:'B1..Bn · E1..Em'}, symbols[], blocks[{ref,role,kind,lines,code,skeleton,skHash,tokens}], edges[{ref,from,to,kind,label,edgeHint,toRole,fromCond,toPreview}] }`
- `AI_PROMPT_HEAD` + `AI_PROMPT_SCHEMA` — **copy NGUYÊN VĂN** (không tóm tắt, không sửa tiếng Việt).
- Import: `stripJsonFence` → `validateNotesJson` → `detectRefOffset` (REF_OFFSETS=[-2,-1,0,1,2]; topology edge + nội dung note; áp `applyRefOffset`) → `reanchorNotes` (PcodeCore.matchBlocks/matchEdges, splitUnanchorable, orphan) → `collectRenameMap`/`applyRenamesToNotes` (đồng bộ tên biến) → save (LRU 8).
- Note ✎ sửa tay (`manual:true`) không bị re-import ghi đè; note lưu theo hàm (`currentFnKey()` = fnv1a(header + '\0' + fn)); `dropSavedNotesForCurrentSource`.
- `notePromptFor(ref, purpose)` cho card (ask/regen); `tryApplySingleNote` (1-note JSON).

### 8.3 `window.__pcode` (giữ y hệt tên + hành vi)
`setView(s,x,y)`, `build`, `fitView`, `centerNode`, `dbgSnapshot`, `exportAI(redact)`, `aiPrompt(redact)`, `importAINotes(text)`, `notePromptFor(ref,purpose)`, `clearNotes()`, `notesState()`, `getState()` (`{scale,tx,ty,nodes}` — scale/tx/ty lấy từ RF viewport), `sessionData()`, `exportSession()`, `importSession(json)`.
`sessionData()` shape GIỮ NGUYÊN: `{src, manualPos, expanded, hlKeys, rankdir, preset, colorVars, theme, notes, notesMode}` — import session phải hoạt động với file session cũ (tests/fixtures/demo-notes-old.session.json là tài liệu sống).

### 8.4 CSS variables & màu
- Port `css/style.css` → `src/styles/app.css`: giữ toàn bộ `:root` variables (`--syn-*`, `--node-*`, `--cond-*`, `--ln-*`, `--edge-*`, `--bg`, `--line`…) và class `.node .k-* .c-* .terminal .tail .lit .dimmed .focus .pl .tk .ln-* .tag .nb .more .coll`…
- Bỏ: `#stage/#zoom/#edges/#nodes` positioning cũ, `#minimap/#mmap`, `#splitter` (giữ splitter nhưng style lại), `#noteLayer/#noteConnector`.
- Thêm: `@import '@xyflow/react/dist/style.css'`.
- Light/dark: giữ cơ chế `document.documentElement.classList 'light'` + `color-scheme` (React Flow tự theo CSS).

## 9. Test chiến lược (D vitest)

- `tests/setup.js`: stub `ResizeObserver`, `IntersectionObserver`, `DOMMatrixReadOnly` (+ `DOMPointReadOnly`), `matchMedia`, `HTMLElement.prototype.getBoundingClientRect` (trả số), `scrollTo`, `URL.createObjectURL`.
- Core tests: port nội dung "đã verify" trong comment các file stub cũ thành test THẬT:
  - lexer: số/suffix (0x1e7z, 0x10ULL, .5, 1., 0b1010), comment nhiều dòng, đếm dòng.
  - parser: if/else/else-if, while, do-while thiếu while, for 2 dấu ';', switch (case/default, statement trước case = lỗi), goto/label, return/break/continue, guard 30000 stmts, errors cap 32 + errLine.
  - cfg: sample 27 node/36 cạnh (đo thật v1.9.3; 25/33 là số lỗi thời trong comment stub), guard clause `if(x) return; doMore();` không mồ côi, collapse block rỗng, dedupeEdges không trùng (bug 4.1: from*100000+to*100+kind va chạm), mergeHeaderIntoFirstBlock (B1 = block code đầu, entry nằm trong block đầu), tail flags, break/continue trong vòng lặp.
  - colors: classifyId (kw/ty/fn/addr/const/gop/var), varColor FNV-1a ổn định.
  - anchors: skeleton bất biến rename, matchBlocks 3 pass, jaccard/linesScore, matchEdges.
  - **fuzz 5.000 graph** (port ý tưởng tests/core/fuzz.test.js của bản test): sinh C ngẫu nhiên → build CFG → kiểm tra: mọi edge from/to tồn tại, mọi node reachable từ entry (trừ goto), không node mồ côi (có cạnh vào hoặc là entry), warnings không crash.
- Notes tests: port 81+ checks (comment notes-jsdom.js cũ là spec): export shape, redact, offset detect (±1, dùng tests/fixtures/ai-real-offbyone.json), reanchor ok/stale/orphan, rename sync (alpha→beta test trong smoke cũ), LRU 8, single-note JSON, manual không ghi đè.
- Ghidra tests: chạy mock_bridge (child_process) + fetch/SSE: health, functions, decompile, resolve, goto, symbolRenamed event → liveNames.
- UI tests (@testing-library/react): render App → build sample → số node/edge trong RF = graphData; click token → hlKeys; import notes JSON → card; session export/import; theme toggle; preset đổi → layout chạy lại.
- `npm test` = `vitest run`; CI không bắt buộc.
