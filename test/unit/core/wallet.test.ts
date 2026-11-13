// L1: card stack logic. Owner: A1.
import { describe, expect, test } from 'vitest';
import { initialWallet, moveCard, reduceWallet, restoreWallet } from '../../../electron/core/wallet';
import { VENDOR_IDS, type WalletState } from '../../../electron/core/types';

const start = (): WalletState => ({ order: [...VENDOR_IDS], active: 'deepseek' });

describe('wallet', () => {
  test('M-01 第一次进来：所有卡都在，没有正在用的', () => {
    expect(initialWallet([...VENDOR_IDS])).toEqual({ order: [...VENDOR_IDS], active: null });
  });
  test('M-02 点后面的卡：抽到最上层并开始切换', () => {
    const r = reduceWallet(start(), { type: 'click', vendor: 'kimi' });
    expect(r.startSwitch).toBe('kimi');
    expect(r.state.order[0]).toBe('kimi');
    expect(r.state.active).toBe('deepseek');
  });
  test('M-02 点正在用的那张或不存在的卡：什么都不做', () => {
    const s = start();
    expect(reduceWallet(s, { type: 'click', vendor: 'deepseek' })).toEqual({ state: s, startSwitch: null });
    expect(reduceWallet(s, { type: 'click', vendor: 'custom-x' })).toEqual({ state: s, startSwitch: null });
  });
  test('M-02 还没有正在用的：点最上面那张也开始切换', () => {
    expect(reduceWallet(initialWallet([...VENDOR_IDS]), { type: 'click', vendor: 'deepseek' }).startSwitch).toBe('deepseek');
  });
  test('M-03 拖到最上层：切换', () => {
    const r = reduceWallet(start(), { type: 'drop', vendor: 'qwen', toIndex: 0 });
    expect(r.startSwitch).toBe('qwen');
    expect(r.state.order.slice(0, 2)).toEqual(['qwen', 'deepseek']);
  });
  test('M-05 拖了但没到最上层不切换，只调整顺序', () => {
    const s = start();
    const r = reduceWallet(s, { type: 'drop', vendor: 'hunyuan', toIndex: 2 });
    expect(r.startSwitch).toBeNull();
    expect(r.state.order).toEqual(['deepseek', 'zhipu', 'hunyuan', 'kimi', 'qwen', 'minimax', 'openai']);
    expect(r.state.active).toBe('deepseek');
  });
  test('M-05 把正在用的卡往下拖：不切换', () => {
    const r = reduceWallet(start(), { type: 'drop', vendor: 'deepseek', toIndex: 3 });
    expect(r.startSwitch).toBeNull();
    expect(r.state.order[3]).toBe('deepseek');
  });
  test('M-05 拖动的位置越界会被夹住；不认识的卡不动', () => {
    expect(reduceWallet(start(), { type: 'drop', vendor: 'zhipu', toIndex: 99 }).state.order.at(-1)).toBe('zhipu');
    expect(reduceWallet(start(), { type: 'drop', vendor: 'zhipu', toIndex: -5 }).startSwitch).toBe('zhipu');
    const s = start();
    expect(reduceWallet(s, { type: 'drop', vendor: 'custom-y', toIndex: 0 }).state).toBe(s);
  });
  test('M-07 测试没通过：退回原来的顺序和正在用的卡', () => {
    const before = start();
    const moved = reduceWallet(before, { type: 'click', vendor: 'minimax' }).state;
    const back = reduceWallet(moved, { type: 'switch-failed', previous: before });
    expect(back).toEqual({ state: before, startSwitch: null });
    expect(back.state.order).not.toBe(before.order);
  });
  test('M-02 切换成功：这张卡在最上层并且正在用', () => {
    const r = reduceWallet(start(), { type: 'switch-ok', vendor: 'openai' });
    expect(r.state.order[0]).toBe('openai');
    expect(r.state.active).toBe('openai');
  });
  test('M-23 重启后顺序和正在用的那张保持不变', () => {
    const saved = { order: ['kimi', 'deepseek', 'gone'] as WalletState['order'], active: 'kimi' as const };
    const r = restoreWallet(saved, [...VENDOR_IDS]);
    expect(r.order.slice(0, 2)).toEqual(['kimi', 'deepseek']);
    expect(r.order).toHaveLength(7);
    expect(r.active).toBe('kimi');
    expect(restoreWallet({ order: ['kimi'], active: 'qwen' }, ['kimi']).active).toBeNull();
    expect(restoreWallet(null, ['zhipu'])).toEqual({ order: ['zhipu'], active: null });
  });
  test('moveCard', () => {
    expect(moveCard(['a', 'b', 'c'] as never, 'c' as never, 1)).toEqual(['a', 'c', 'b']);
  });
});
