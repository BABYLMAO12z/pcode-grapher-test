/* =========================================================================
 * PCODE Grapher · src/ui/icons.jsx — icon SVG inline thay emoji trong chrome
 * 14px · stroke 1.8 · currentColor (tự ăn theo màu chữ nút) · fill none.
 * IcBolt/IcHelpFilled là bản filled. Toạ độ trên lưới viewBox 24×24.
 * ========================================================================= */

/** Khung chung — mọi icon kế thừa; class "icn" căn baseline qua app.css. */
const I = ({ size = 14, children, fill = false, style, ...rest }) => (
  <svg
    className="icn"
    width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false"
    fill={fill ? 'currentColor' : 'none'}
    stroke={fill ? 'none' : 'currentColor'}
    strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
    style={style} {...rest}
  >
    {children}
  </svg>
);

/** ⤓ / 📥 — mũi tên ĐI VÀO khay (import, load, notes, PNG/SVG về máy). */
export const IcDown = (p) => (
  <I {...p}>
    <path d="M12 4v11" />
    <path d="M6.5 11 12 16.5 17.5 11" />
    <path d="M4 20h16" />
  </I>
);

/** 📤 — mũi tên ĐI RA khỏi khay (export data cho AI). */
export const IcUp = (p) => (
  <I {...p}>
    <path d="M12 15V4" />
    <path d="M6.5 8.5 12 3l5.5 5.5" />
    <path d="M4 20h16" />
  </I>
);

/** 📖 — sách mở (panel luồng logic). */
export const IcBook = (p) => (
  <I {...p}>
    <path d="M2.5 5.5C6 4.5 9.5 4.7 12 6.2c2.5-1.5 6-1.7 9.5-.7V18c-3.5-1-7-.8-9.5.7-2.5-1.5-6-1.7-9.5-.7Z" />
    <path d="M12 6.2v12.5" />
  </I>
);

/** 🧭 — la bàn (luồng chính). */
export const IcCompass = (p) => (
  <I {...p}>
    <circle cx="12" cy="12" r="8.7" />
    <path d="M15.7 8.3 13.4 13.4 8.3 15.7l2.3-5.1Z" />
  </I>
);

/** 📋 — copy (hai tờ chồng). */
export const IcCopy = (p) => (
  <I {...p}>
    <rect x="8.8" y="8.8" width="11.4" height="11.4" rx="2" />
    <path d="M5.2 14.8V7a2.2 2.2 0 0 1 2.2-2.2h7.8" />
  </I>
);

/** 🐛/🐞 — bug (debug). */
export const IcBug = (p) => (
  <I {...p}>
    <circle cx="12" cy="13.5" r="6" />
    <path d="M12 7.5V4.8" />
    <path d="M8.7 8.6 7 6.4M15.3 8.6 17 6.4" />
    <path d="M6 12.5H3.4M6.6 16.4l-2.6 2M18 12.5h2.6M17.4 16.4l2.6 2" />
  </I>
);

/** 💾 — đĩa mềm (save session). */
export const IcSave = (p) => (
  <I {...p}>
    <path d="M5 3h11l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
    <path d="M8 3v4.5h8V3" />
    <circle cx="12" cy="15" r="2.7" />
  </I>
);

/** 🗺 — bản đồ gập (minimap). */
export const IcMap = (p) => (
  <I {...p}>
    <path d="M8.5 4 3 6v14l5.5-2 7 2L21 18V4l-5.5 2Z" />
    <path d="M8.5 4v14M15.5 6v14" />
  </I>
);

/** 🗑 — thùng rác (xoá note). */
export const IcTrash = (p) => (
  <I {...p}>
    <path d="M4 7h16" />
    <path d="M10 7V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2" />
    <path d="M6.2 7l.8 13a1.5 1.5 0 0 0 1.5 1.3h7a1.5 1.5 0 0 0 1.5-1.3l.8-13" />
    <path d="M10.2 11v6M13.8 11v6" />
  </I>
);

/** ✎/✏️ — bút chì (sửa). */
export const IcEdit = (p) => (
  <I {...p}>
    <path d="M4 20l1.1-4L16.6 4.5a2.05 2.05 0 0 1 2.9 2.9L8 18.9Z" />
    <path d="M14.6 6.5l2.9 2.9" />
  </I>
);

/** ↺ — mũi tên quay lui (huỷ sửa). */
export const IcUndo = (p) => (
  <I {...p}>
    <path d="M4.5 9.5h9a5.5 5.5 0 0 1 0 11H9" />
    <path d="M8 5.5 4.5 9.5 8 13.5" />
  </I>
);

/** >_ — terminal (debug panel). */
export const IcTerm = (p) => (
  <I {...p}>
    <rect x="3" y="4.5" width="18" height="15" rx="2" />
    <path d="M7.5 9.5l3 3-3 3" />
    <path d="M12.5 15.5h4" />
  </I>
);

/** ✓ — tick (lưu). */
export const IcCheck = (p) => (
  <I {...p}><path d="M4.5 12.5l5 5 10-11" /></I>
);

/** 📝 — tờ giấy có dòng ghi (AI notes). */
export const IcNote = (p) => (
  <I {...p}>
    <rect x="5" y="3.5" width="14" height="17" rx="2" />
    <path d="M9 8.5h6M9 12h6M9 15.5h4" />
  </I>
);

/** ❓ — dấu hỏi trong vòng (điểm chưa rõ). */
export const IcHelp = (p) => (
  <I {...p}>
    <circle cx="12" cy="12" r="8.7" />
    <path d="M9.4 9.2a2.7 2.7 0 0 1 5.3.6c0 1.7-2.6 2.1-2.6 3.7" />
    <path d="M12 16.9h.01" />
  </I>
);

/** ☀️ — mặt trờ (theme toggle khi đang dark). */
export const IcSun = (p) => (
  <I {...p}>
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 2.8v2.2M12 19v2.2M2.8 12h2.2M19 12h2.2" />
    <path d="M5.5 5.5l1.6 1.6M16.9 16.9l1.6 1.6M18.5 5.5l-1.6 1.6M7.1 16.9l-1.6 1.6" />
  </I>
);

/** 🌙 — mặt trăng (theme toggle khi đang light). */
export const IcMoon = (p) => (
  <I {...p}>
    <path d="M20 14.5A8.3 8.3 0 0 1 9.5 4a8.3 8.3 0 1 0 10.5 10.5Z" />
  </I>
);

/** ⚡ — tia sét FILLED (brand + "tác động lên hệ thống"). */
export const IcBolt = (p) => (
  <I {...p} fill>
    <path d="M13.2 2.3 5.4 13.4a.6.6 0 0 0 .5 1h5.2l-.9 6.7a.6.6 0 0 0 1 .5l7.8-11.1a.6.6 0 0 0-.5-1h-5.2l.9-6.7a.6.6 0 0 0-1-.5Z" />
  </I>
);
