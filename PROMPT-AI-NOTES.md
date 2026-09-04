# PROMPT-AI-NOTES — "hợp đồng" giữa PCODE Grapher và AI

File này là **bản tham khảo cho người dùng**: prompt mà nút **📋 AI prompt** copy (đã kèm data
hàm) có dạng như bên dưới, và AI phải trả về **duy nhất một object JSON** đúng schema.

> Nguồn prompt thật nằm trong `js/ui/notes-ai.js` (`AI_PROMPT_HEAD` + `AI_PROMPT_SCHEMA`) — file
> này là bản ghi chú, KHÔNG phải nguồn. Nếu muốn đổi prompt, sửa trong `notes-ai.js`.

## Luồng

```
[📤 AI data / 📋 AI prompt] → dán vào chat AI → nhận JSON → [📥 Notes]
```

## Prompt (mẫu)

```
Bạn là trình phân tích mã giả decompiled (C của Ghidra). Nhiệm vụ: đọc DỮ LIỆU và ghi chú
phân tích TRUNG LẬP cho MỌI block và MỌI edge, phục vụ người đọc kỹ thuật.

QUY TẮC BẮT BUỘC:
1. Chỉ mô tả hành vi suy ra TRỰC TIẾP từ code. CẤM đoán ý định, cấm đoán loại phần mềm,
   cấm nhận định an toàn/malware, cấm dùng kiến thức ngoài DỮ LIỆU.
2. Không chắc chi tiết nào → ghi vào summary.unknowns (kèm ref), KHÔNG bịa.
3. Dùng đúng tên trong bảng "symbols". Ref chỉ dùng mã Bxx/Exx có sẵn trong DỮ LIỆU;
   KHÔNG tự tạo ref; KHÔNG bỏ sót — mọi block và mọi edge đều phải có note.
   Với edges: chép NGUYÊN "from", "to", "kind" của từng edge từ DỮ LIỆU.
4. blocks[].note: 1–2 câu "block này làm gì". Nếu block có rẽ nhánh/vòng lặp (xem "kind"
   và "code"): nêu điều kiện và MỖI nhánh làm gì.
5. blocks[].plain: đúng 1 câu ngôn ngữ thường, ngắn, không thuật ngữ, tóm tắt block.
6. edges[].note: đúng công thức: "Vì <điều kiện đúng/sai, hoặc sự kiện return/break/
   continue/goto/case N, hoặc hết vòng lặp> nên <chuyển tới Bxx — dùng "toPreview" của
   block đích để nói rõ nó làm gì>."
7. summary.sentences: 5–12 câu mô tả LUỒNG CHUNG của hàm theo THỨ TỰ THỰC THI; mỗi câu
   gắn "refs" (các block câu đó nói về).
8. Xuất DUY NHẤT một object JSON đúng SCHEMA dưới đây. Giá trị tiếng Việt, không markdown,
   không text trước/sau JSON.

SCHEMA:
{
  "meta": { "fn": "<tên hàm>", "headerHash": "<chép NGUYÊN từ DỮ LIỆU.meta.headerHash>" },
  "blocks": [ { "ref": "B1", "note": "...", "plain": "..." } ],
  "edges":  [ { "ref": "E1", "from": "B1", "to": "B2", "kind": "false", "note": "Vì ... nên ..." } ],
  "summary": {
    "sentences": [ { "text": "...", "refs": ["B1", "B2"] } ],
    "sideEffects": [ "viết bộ nhớ / gọi hàm quan trọng" ],
    "unknowns": [ "chi tiết chưa rõ (kèm ref)" ]
  }
}

DỮ LIỆU:
<JSON do exportAIData() sinh: meta, symbols, blocks (code+skeleton), edges (fromCond+toPreview)>
```

## Data AI nhận được (mỗi block)

| Trường | Ý nghĩa |
|---|---|
| `ref` | Mã block `B1…Bn` theo thứ tự CFG — **AI chỉ được dùng lại** |
| `kind` | `entry/block/cond/label/…` (+ `:if/while/…`) |
| `lines` | Phạm vi dòng source `[đầu, cuối]` |
| `code` | Text block (đã redact hex nếu Shift+click) |
| `skeleton` / `skHash` | Vân tay cấu trúc (tool dùng để khớp lại, AI bỏ qua) |
| `tokens` | Danh sách identifier (data-key) |

Mỗi edge có thêm: `fromCond` (điều kiện khi từ node cond) và `toPreview` (dòng đầu block đích)
— để AI viết đúng công thức "vì…nên…".

## Quy ước chống hallucination

- **Không** nhận định malware/độc hại, **không** đoán mục đích phần mềm.
- **Không** chắc → `summary.unknowns` (kèm ref), không bịa.
- Chỉ dùng tên trong bảng `symbols`; không phát minh tên mới.
- Ref phải khớp 1-1 với data — thiếu 1 ref là import báo ✗ orphan.

## Khi tool nhận JSON về (`📥 Notes`)

- Tự strip ```` ```json ```` fence nếu AI bọc markdown.
- Validate: `blocks[]` phải có `ref` + `note`; `edges[]` (nếu có) phải có `ref` + `note`.
- Khớp lại bằng anchor → mỗi note có trạng thái: **✓ ok** (code không đổi) · **⚠ stale**
  (code đã sửa) · **✗ orphan** (không tìm thấy block).
- `meta.headerHash` không khớp hàm đang vẽ → cảnh báo nhưng vẫn nạp (note có thể ✗).
