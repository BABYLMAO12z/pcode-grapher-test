/* Node < 22 chưa có worker_threads.markAsUncloneable, còn undici 8 (do jsdom 30
 * kéo theo) lại destructure hàm này lúc nạp module → toàn bộ test dùng môi
 * trường jsdom chết ngay khi khởi tạo worker:
 *   TypeError: webidl.util.markAsUncloneable is not a function
 * Shim no-op (hàm này chỉ đánh dấu object không cloneable qua structuredClone —
 * không ảnh hưởng logic test). Nạp bằng --require TRƯỚC khi vitest nạp jsdom. */
const wt = require('node:worker_threads');
if (typeof wt.markAsUncloneable !== 'function') {
  try {
    wt.markAsUncloneable = () => {};
  } catch {
    /* runtime khoá exports → bỏ qua, test jsdom sẽ báo lỗi như cũ */
  }
}
