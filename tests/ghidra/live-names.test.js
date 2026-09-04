/* Hồi quy: pushLiveNames (qua setLiveSymbols/resetLiveSymbols) KHÔNG được đụng
 * store khi nội dung symbol không đổi — trước đây mỗi lần gọi đều map lại toàn
 * bộ rfNodes (= re-render mọi block/edge vô ích, vd ghidraOpenFunction gọi 2 lần).
 */
import { describe, it, expect } from 'vitest';
import { useStore } from '../../src/store/useStore.js';
import { setLiveSymbols, resetLiveSymbols } from '../../src/ghidra/bridge.js';

const SYMS = {
  FUN_1: { addr: '0x1', name: 'myFunc', source: 'USER_DEFINED', kind: 'function', type: null },
  DAT_2: { addr: '0x2', name: 'gFlag', source: 'USER_DEFINED', kind: 'data', type: null },
};

function setup() {
  useStore.getState()._resetForTest();
  useStore.setState({
    rfNodes: [
      { id: 'n0', type: 'cfg', position: { x: 0, y: 0 }, data: { cfgNode: { id: 0 }, liveNames: new Map() } },
      { id: 'np0', type: 'notePanel', position: { x: 200, y: 0 }, data: {} },
    ],
    rfEdges: [],
  });
}

describe('pushLiveNames no-op khi không đổi', () => {
  it('gọi 2 lần cùng nội dung → rfNodes và liveNames giữ nguyên identity', () => {
    setup();
    setLiveSymbols(structuredClone(SYMS));
    const s1 = useStore.getState();
    expect(s1.liveNames.get('FUN_1')).toBe('myFunc');
    expect(s1.rfNodes[0].data.liveNames.get('FUN_1')).toBe('myFunc');
    // node phụ (notePanel) không bị đụng tới
    expect(s1.rfNodes[1].data.liveNames).toBeUndefined();

    setLiveSymbols(structuredClone(SYMS)); // nội dung Y HỆT, object khác
    const s2 = useStore.getState();
    expect(s2.rfNodes).toBe(s1.rfNodes);
    expect(s2.liveNames).toBe(s1.liveNames);
  });

  it('rename thật → rfNodes mới + tên live mới', () => {
    setup();
    setLiveSymbols(structuredClone(SYMS));
    const before = useStore.getState().rfNodes;
    const renamed = structuredClone(SYMS);
    renamed.FUN_1.name = 'renamedFunc';
    setLiveSymbols(renamed);
    const after = useStore.getState();
    expect(after.rfNodes).not.toBe(before);
    expect(after.liveNames.get('FUN_1')).toBe('renamedFunc');
    expect(after.rfNodes[0].data.liveNames.get('FUN_1')).toBe('renamedFunc');
  });

  it('reset 2 lần → lần 2 no-op', () => {
    setup();
    setLiveSymbols(structuredClone(SYMS));
    resetLiveSymbols();
    const s1 = useStore.getState();
    expect(s1.liveNames.size).toBe(0);
    resetLiveSymbols();
    expect(useStore.getState().rfNodes).toBe(s1.rfNodes);
  });
});
