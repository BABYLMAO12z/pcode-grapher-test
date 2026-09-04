/* U3 — postbuild: chống tái diễn lỗi "src đã sửa nhưng bundle triển khai không
 * bao giờ được build lại" (nguyên nhân gốc của lỗi "click block không mở note"
 * tồn tại dai dẳng: người dùng luôn chạy bản build tĩnh ở gốc repo).
 *
 * Việc cần làm sau mỗi `vite build`:
 *   1. dist/index.dev.html → dist/index.html (entry build là index.dev.html
 *      để index.html ở gốc có thể là bản ĐÃ BUILD mà không đệ quy bundle).
 *   2. Đồng bộ dist/ ra GỐC theo quy ước deploy tĩnh của repo (commit đầu):
 *      index.html + assets/ ở gốc luôn là bản mới nhất — mở gốc qua HTTP
 *      (Tool Dir của bridge Ghidra / bất kỳ server tĩnh) là chạy được ngay.
 */
import { copyFileSync, cpSync, existsSync, renameSync, rmSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(dirname(resolve(fileURLToPath(import.meta.url))));
const dist = resolve(root, 'dist');

const devHtml = resolve(dist, 'index.dev.html');
if (existsSync(devHtml)) {
  renameSync(devHtml, resolve(dist, 'index.html'));
  console.log('postbuild: dist/index.dev.html → dist/index.html');
} else if (!existsSync(resolve(dist, 'index.html'))) {
  throw new Error('postbuild: không tìm thấy dist/index*.html — build lỗi?');
}

rmSync(resolve(root, 'assets'), { recursive: true, force: true });
cpSync(resolve(dist, 'assets'), resolve(root, 'assets'), { recursive: true });
copyFileSync(resolve(dist, 'index.html'), resolve(root, 'index.html'));
console.log('postbuild: đã cập nhật index.html + assets/ ở gốc (bản deploy tĩnh)');
