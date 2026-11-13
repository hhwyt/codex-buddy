import { describe, expect, test } from 'vitest';
import { hide, keyTail, looksLikeKey } from '../../../electron/core/redact';

describe('redact', () => {
  test('S-08 日志里的 Key 都被打码', () => {
    const zhipu = '0123456789abcdef0123456789abcdef.AbCdEfGhIjKlMnOp';
    const text = `key=${zhipu} Authorization: Bearer abcdef123456 sk-proj-1234567890abcd {"OPENAI_API_KEY":"sk-zzzzzzzzzzzz"} "access_token":"tok.en" api_key = "plainsecret99"`;
    const out = hide(text);
    expect(out).not.toContain(zhipu);
    expect(out).not.toContain('abcdef123456');
    expect(out).not.toContain('1234567890abcd');
    expect(out).not.toContain('tok.en');
    expect(out).not.toContain('plainsecret99');
    expect(looksLikeKey(out)).toBe(false);
  });
  test('普通文字不变', () => {
    expect(hide('切换到 DeepSeek，测试连通')).toBe('切换到 DeepSeek，测试连通');
  });
  test('keyTail 只给后四位，太短的不给', () => {
    expect(keyTail('sk-abcdefgh7c21')).toBe('7c21');
    expect(keyTail('short')).toBeNull();
    expect(keyTail(null)).toBeNull();
  });
  test('looksLikeKey 认出完整的 Key', () => {
    expect(looksLikeKey('sk-abcdefghijklmnop')).toBe(true);
    expect(looksLikeKey('sk-****')).toBe(false);
  });
});
