import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

/* FIX(31): Node < 22 chưa có worker_threads.markAsUncloneable, còn undici 8 (do
 * jsdom 30 kéo theo) destructure hàm này ngay khi nạp module → MỌI file test
 * dùng jsdom chết ở bước tạo môi trường ("webidl.util.markAsUncloneable is not a
 * function"): 7/10 file test không hề chạy, chỉ 23/247 test được thực thi và
 * không ai nhận ra vì vitest vẫn báo "3 passed".
 * Tiêm shim qua NODE_OPTIONS Ở ĐÂY (config nạp trong tiến trình cha trước khi
 * pool spawn worker; worker kế thừa env — execArgv của poolOptions không tới). */
if (typeof process !== 'undefined' && !/node-shim\.cjs/.test(process.env.NODE_OPTIONS || '')) {
  const shim = resolve(dirname(fileURLToPath(import.meta.url)), 'tests/node-shim.cjs');
  process.env.NODE_OPTIONS = ((process.env.NODE_OPTIONS || '') + ' --require ' + JSON.stringify(shim)).trim();
}

const BRIDGE = 'http://127.0.0.1:8765';
const ROOT = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/api': { target: BRIDGE, changeOrigin: true },
      '/events': { target: BRIDGE, changeOrigin: true, ws: false },
    },
  },
  build: {
    // elk (1,4 MB) là chunk lazy — không tính vào tải lần đầu; nâng ngưỡng cảnh báo
    // để build sạch, thay vì tắt hẳn cảnh báo cho mọi chunk.
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      // U3: entry build là index.dev.html — index.html ở GỐC là bản ĐÃ BUILD
      // (quy ước deploy tĩnh của repo) nên không được dùng làm entry nữa, nếu
      // không vite sẽ cuốn bundle cũ vào bundle mới (đệ quy).
      input: resolve(ROOT, 'index.dev.html'),
      output: {
        // Vite 8 (rolldown) chỉ nhận HÀM, không nhận object.
        // elk/dagre là import() động → tách riêng để chỉ tải khi thật sự layout.
        manualChunks(id) {
          if (id.includes('node_modules/elkjs')) return 'elk';
          if (id.includes('node_modules/@dagrejs')) return 'dagre';
          if (id.includes('node_modules/@xyflow') || id.includes('node_modules/d3-')) return 'xyflow';
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) return 'react';
          return null;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.{js,jsx}'],
    testTimeout: 60000,
  },
});
