import { describe, it, expect } from 'vitest';
import { richSegments, buildColorCtx, colorCtxForGraph } from '../../src/notes/richtext.js';
import { varColor } from '../../src/core/colors.js';

describe('richtext — round-trip nguyên văn', () => {
  it('nối toàn bộ segment === input (kể cả note AI phức tạp)', () => {
    const cases = [
      '',
      'Nhánh local_130 == 0: dựng QMessageLogger, phát cảnh báo \'[active] phan hoi khong doc duoc:\' kèm QString local_118. Sau đó dựng thông điệp QString vào local_148 (FUN_140043820 rồi FUN_1400305f0) và gọi lazy::ActivationService::activationFailed(*param_1, 4294957297, &local_148); cuối khối gán pQVar9 = &local_148 để hủy ở khối kết thúc.',
      'true sang B2 — false rơi xuống B3 (while (iVar1 < 0x10))',
      'emoji 📝 và unicode đầy đủ: điều kiện, khối, mũi tên ↺> "chuỗi ăn \\n escape"',
      'B1 B12 E3 E99 xen lẫn văn bản',
      'sát mép: local_1(FUN_1400)QString::',
    ];
    for (const s of cases) {
      const joined = richSegments(s).map((g) => g.s).join('');
      expect(joined).toBe(s);
    }
  });
});

describe('richtext — ref chip (giữ nguyên hợp đồng của noteWithChips)', () => {
  it('B#/E# → ref, ref đứng CUỐI/không word-boundary vẫn bắt đúng', () => {
    const segs = richSegments('đi B12 rồi E3 xong.');
    const refs = segs.filter((g) => g.t === 'ref').map((g) => g.s);
    expect(refs).toEqual(['B12', 'E3']);
  });

  it('Ký hiệu KHÔNG phải ref giữ trơn: B, E, X1, BBE, b1 (viết thường)', () => {
    for (const s of ['B', 'E', 'X1', 'BBE', 'b1', 'e12']) {
      const segs = richSegments(s);
      expect(segs.every((g) => g.t !== 'ref')).toBe(true);
    }
  });
});

describe('richtext — tô màu parity block', () => {
  it('biến Ghidra → var: local_130/param_1/pQVar9/local_res8 + color = varColor()', () => {
    for (const v of ['local_130', 'param_1', 'pQVar9', 'local_res8', 'uVar1', 'in_FS_OFFSET']) {
      const sp = richSegments(v).find((g) => g.t === 'sp');
      expect(sp, v).toBeTruthy();
      expect(sp.s).toBe(v);
      expect(sp.color).toBe(varColor(v)); // parity tuyệt đối với block
    }
  });

  it('identifier ASCII thường KHÔNG thành var: block/note/sang/gọi để trơn', () => {
    for (const w of ['block', 'note', 'sang', 'khoi', 'warning']) {
      const segs = richSegments('lặp ' + w + ' qua');
      expect(segs.filter((g) => g.t === 'sp' && g.color), w).toEqual([]);
    }
  });

  it('type/kw/addr/fn/const/gop/num/str đúng class rt-*', () => {
    const t = (w) => (richSegments(w).find((g) => g.t === 'sp') || {}).cls || null;
    expect(t('QString')).toBe('rt-ty');
    expect(t('uint32_t')).toBe('rt-ty');
    expect(t('if')).toBe('rt-kw');
    expect(t('return')).toBe('rt-kw');
    expect(t('FUN_140043820')).toBe('rt-addr');
    expect(t('DAT_140056000')).toBe('rt-addr');
    expect(t('MAX_BUF')).toBe('rt-const');
    expect(t('CONCAT44')).toBe('rt-gop');
    expect(t('4294957297')).toBe('rt-num');
    expect(t('0xff')).toBe('rt-num');
    expect(t('"chuoi"')).toBe('rt-str');
  });

  it("fn chỉ khi '(' SÁT KỀ: warning( → rt-fn, nhưng 'ghi (' KHÔNG tô", () => {
    const a = richSegments('QMessageLogger::warning(pQVar7)');
    expect(a.find((g) => g.s === 'warning').cls).toBe('rt-fn');
    const b = richSegments('ghi (xong)'); // prose có space → KHÔNG phải call
    expect(b.every((g) => g.t === 'txt')).toBe(true);
  });

  it('chuỗi C++ ::: QMessageLogger:: → rt-ty (không cần ()), CamelCase LẺ "Sau" KHÔNG tô', () => {
    const segs = richSegments('Sau đó QMessageLogger::QMessageLogger xong');
    // "Sau" trơn → gộp vào đoạn txt, KHÔNG tồn tại span màu nào mang tên nó
    expect(segs.filter((g) => g.t === 'sp' && g.s === 'Sau')).toEqual([]);
    const names = segs.filter((g) => g.s === 'QMessageLogger');
    expect(names.length).toBe(2);
    expect(names.every((g) => g.cls === 'rt-ty')).toBe(true);
  });

  it("const cần ≥3 ký tự thật: 'RA' prose để trơn, 'OFF' được tô", () => {
    const segs = richSegments('RA của block');
    expect(segs.filter((g) => g.t === 'sp' && g.s === 'RA')).toEqual([]);
    expect((richSegments('OFF').find((g) => g.t === 'sp') || {}).cls).toBe('rt-const');
  });
});

describe('richtext — DYNAMIC ctx (biến/hàm ĐỔI TÊN vẫn tô đúng, không cứng)', () => {
  /* Ghidra pcode mẫu: pQVar7 = FUN_140043820(&local_res8, local_140); */
  const gdata = {
    nodes: [{
      lines: [{
        toks: [
          { t: 'id', v: 'pQVar7' }, { t: 'op', v: '=' },
          { t: 'id', v: 'FUN_140043820' }, { t: 'op', v: '(' },
          { t: 'op', v: '&' }, { t: 'id', v: 'local_res8' },
          { t: 'op', v: ',' }, { t: 'id', v: 'local_140' }, { t: 'op', v: ')' },
        ],
      }],
    }],
  };

  it('buildColorCtx: classify bằng classifyId của block, map theo tên hiển thị', () => {
    const ctx = buildColorCtx(gdata, null);
    expect(ctx.vars.get('pQVar7')).toBe('pQVar7');
    expect(ctx.vars.get('local_res8')).toBe('local_res8');
    expect(ctx.clsOf.get('FUN_140043820')).toBe('rt-addr'); // block tô addr kể cả khi gọi
  });

  it('rename biến: note dùng TÊN MỚI, màu = varColor(tên GỐC) — parity tuyệt đối với block', () => {
    const live = new Map([['local_res8', 'errorFlags'], ['pQVar7', 'logger']]);
    const ctx = buildColorCtx(gdata, live);
    const segs = richSegments('gán logger = &errorFlags cuối khối', ctx);
    const L = segs.find((g) => g.s === 'logger');
    const E = segs.find((g) => g.s === 'errorFlags');
    expect(L.color).toBe(varColor('pQVar7'));     // block tô varColor(tên gốc)
    expect(E.color).toBe(varColor('local_res8'));
  });

  it('rename hàm: tên mới giữ đúng class của block (FUN_ = addr), KHÔNG bị ép rt-fn', () => {
    const live = new Map([['FUN_140043820', 'buildMessage']]);
    const ctx = buildColorCtx(gdata, live);
    const sp = richSegments('gọi buildMessage(&local_res8) xong', ctx)
      .find((g) => g.s === 'buildMessage');
    expect(sp.cls).toBe('rt-addr'); // heuristic tĩnh sẽ cho rt-fn vì '(' sát — ctx thắng
    // tham số sau rename vẫn parity
    expect(segsParity(richSegments('gọi buildMessage(&local_res8) xong', ctx), 'local_res8'))
      .toBe(varColor('local_res8'));
  });

  it('tên KHÔNG có trong graph → rơi về fallback static (biến Ghidra vẫn tô)', () => {
    const ctx = buildColorCtx(gdata, null);
    const sp = richSegments('biến local_999 ngoài graph', ctx).find((g) => g.s === 'local_999');
    expect(sp.color).toBe(varColor('local_999'));
  });

  it('colorCtxForGraph: cache theo reference, graphData mới → build lại', () => {
    const live = new Map();
    const a = colorCtxForGraph(gdata, live);
    expect(colorCtxForGraph(gdata, live)).toBe(a);     // cùng ref → cùng ctx
    const gdata2 = { nodes: [] };
    expect(colorCtxForGraph(gdata2, live)).not.toBe(a); // graph mới → ctx mới
    expect(colorCtxForGraph(null, live).vars.size).toBe(0);
  });
});

function segsParity(segs, name) {
  const g = segs.find((x) => x.s === name);
  return g ? g.color : null;
}
