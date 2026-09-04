/* =========================================================================
 * PCODE Grapher · js/core/colors.js — classify token (keyword/type/func/var) + bảng màu biến; gom PcodeCore
 * Độc lập. Export: PcodeCore (dùng bởi UI + node tests).
 * ========================================================================= */


const KEYWORDS = new Set(('if else while do for switch case default return goto break continue ' +
  'typedef struct union enum const volatile static extern register inline sizeof new delete class namespace using ' +
  'try catch throw asm __asm __cdecl __stdcall __fastcall __thiscall __vectorcall __usercall __userpurge ' +
  '__noreturn __declspec __unaligned near far NOINLINE').split(/\s+/));

const TYPE_WORDS = new Set(('void char short int long float double _Bool bool wchar_t signed unsigned size_t ssize_t ' +
  'ptrdiff_t intptr_t uintptr_t int8_t int16_t int32_t int64_t uint8_t uint16_t uint32_t uint64_t ' +
  'byte word dword qword uint ushort uchar ulong ulonglong longlong undefined code va_list FILE HANDLE ' +
  'LPCSTR LPSTR LPWSTR LPCWSTR LPVOID BOOL CHAR WCHAR DWORD QWORD BYTE WORD UINT INT ULONG __int64 ' +
  // common C++/Qt types seen in decompiler output (were mis-categorised as plain vars)
  'QString QDebug QStringRef QStringList QString QByteArray QChar QObject QLayout QModelIndex ' +
  'QPoint QSize QRect QVariant wstring string vector map set tuple optional shared_ptr unique_ptr ' +
  'wchar_t nullptr size_type').split(/\s+/));

function isTypeWord(v) {
  return TYPE_WORDS.has(v) || /^(undefined\d*|u?int\d+_t|__uint\d+|__int\d+)$/.test(v);
}
// Ghidra/IDA address-style symbols only by *prefix* — do NOT classify arbitrary
// UPPER_CASE constants (MAX_BUF_SIZE, __STDC__...) as addresses.
function isAddrWord(v) {
  return /^(FUN_|DAT_|PTR_|LAB_|s_|puRam|iRam|uRam|aff_ram|switchD_|caseD_|jpt_|ram0x)/.test(v);
}
// UPPER_CASE = compile-time constant / enum value (MAX, TRUE, MAX_BUF_SIZE,
// __LINE__, __STDC__), distinguishable from Ghidra ops and address prefixes.
// Strip leading/trailing underscores so __LINE__ / __STDC__ are caught; require
// at least 2 real characters so single-letter pseudo-variables stay "var".
function isConstWord(v) {
  if (isGhidraOp(v)) return false;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(v)) return false;
  const stripped = v.replace(/^_+|_+$/g, '');
  if (stripped.length < 2) return false;
  return /^[A-Z][A-Z0-9_]*$/.test(stripped);
}
// Ghidra built-in ops (CONCAT44, SUB41, ZEXTEND814, ...)
function isGhidraOp(v) {
  return /^(CONCAT\d+|SUB\d+|ZEXTEND\d+|SEXTEND\d+|EXTRACT\d+|SBORROW\d+|CARRY\d+|SCARRY\d+|INT_\w+|FLOAT_\w+|TRUNC\d+|POPCOUNT\d+|CARRYFROM|CAST|SUBPIECE|PIECE|ZEXT|SEXT|INSERT|EXTRACT|LZCOUNT|CPoolRef|NEW|DELETE)/.test(v);
}

// Assign stable per-identifier colors
// v5 — CATEGORICAL COLOR: một màu DUY NHẤT cho mọi biến (giống v4).
// Dark: sky-teal #8eccc4 (lab #83beb7, sáng hơn chút cho AA trên node navy).
// Light: giữ VSCode Light+ navy. Phải khớp --syn-var trong app.css.
const VAR_COLOR = '#8eccc4';        // dark v5 — sky-teal categorical var
const VAR_COLOR_LIGHT = '#001080';  // VSCode Light+ variable/param — light theme

// Giữ tên export cũ để không vỡ import bên ngoài; NỘI DUNG chỉ còn 1 slot —
// hợp đồng test đã đổi theo thiết kế v4 (không còn "200 tên → ≥20 màu").
const VAR_PALETTE = [VAR_COLOR];
const VAR_PALETTE_LIGHT = [VAR_COLOR_LIGHT];

function varColor(name) {
  // `name` giữ trong chữ ký để tương thích mọi caller (tokens/svg/richtext) —
  // v4: mọi biến MỘT màu, chỉ đổi theo theme.
  void name;
  try {
    if (typeof document !== 'undefined' && document.documentElement.classList.contains('light'))
      return VAR_COLOR_LIGHT;
  } catch (e) { /* node tests */ }
  return VAR_COLOR;
}

// classify an identifier token given its neighbours
function classifyId(toks, i) {
  if (!toks || i < 0 || i >= toks.length) return 'op';
  const v = toks[i].v;
  const nx = toks[i + 1];
  const nxIsParen = nx && nx.t === 'op' && nx.v === '(';
  if (KEYWORDS.has(v)) return 'kw';
  if (isGhidraOp(v)) return 'gop';           // CONCAT44/SUB41… regardless of a following '(', so a bare op in an expression is still an op
  if (isTypeWord(v)) return 'ty';
  if (isAddrWord(v)) return 'addr';
  if (nxIsParen) return 'fn';                // call/cmd — before const so MAX(...) reads as a function, bare MAX as a constant
  if (isConstWord(v)) return 'const';        // MAX, TRUE, MAX_BUF_SIZE, __STDC__ … (not an address)
  if (/^[A-Z][a-z]/.test(v)) return 'ty';    // CamelCase → class/type (QString, MyVar …)
  return 'var';
}

export {
  KEYWORDS, TYPE_WORDS, VAR_COLOR, VAR_COLOR_LIGHT, VAR_PALETTE, VAR_PALETTE_LIGHT,
  isTypeWord, isAddrWord, isConstWord, isGhidraOp, varColor, classifyId
};
