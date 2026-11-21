import { expect, test, vi } from 'vitest';
import { gzipSync } from 'node:zlib';
import {
  buildFromDelta,
  downloadResumable,
  fetchSize,
  parseBlockmap,
  planDelta,
} from '../../../electron/core/delta';

const blockmap = (checksums: string[], sizes: number[]) =>
  gzipSync(JSON.stringify({ files: [{ checksums, sizes }] }));
const bytes = (value: string) => new Uint8Array(Buffer.from(value));

test('F-06 parseBlockmap 算出每块偏移；格式不对就抛错', () => {
  const blocks = parseBlockmap(blockmap(['first', 'second', 'third'], [3, 5, 2]));

  expect(blocks).toEqual([
    { offset: 0, size: 3, checksum: 'first' },
    { offset: 3, size: 5, checksum: 'second' },
    { offset: 8, size: 2, checksum: 'third' },
  ]);
  expect(() => parseBlockmap(blockmap(['only-one'], []))).toThrow('Invalid blockmap');
});

test('F-06 planDelta 旧文件有的块复制、没有的取，相邻的合并；fetchSize 等于要取的字节', () => {
  const oldBlocks = parseBlockmap(blockmap(['A', 'B', 'old-only'], [4, 4, 4]));
  const newBlocks = parseBlockmap(blockmap(['A', 'B', 'C', 'D', 'A'], [4, 4, 4, 4, 4]));

  const pieces = planDelta(oldBlocks, newBlocks);

  expect(pieces).toEqual([
    { kind: 'copy', from: 0, size: 8 },
    { kind: 'fetch', start: 8, size: 8 },
    { kind: 'copy', from: 0, size: 4 },
  ]);
  expect(fetchSize(pieces)).toBe(8);
});

test('F-06 buildFromDelta 拼出和新文件一样的字节；取回长度不对就抛错', async () => {
  const oldData = bytes('AAAABBBBzzzz');
  const newData = bytes('AAAABBBBCCCCDDDDAAAA');
  const oldBlocks = parseBlockmap(blockmap(['A', 'B', 'old-only'], [4, 4, 4]));
  const newBlocks = parseBlockmap(blockmap(['A', 'B', 'C', 'D', 'A'], [4, 4, 4, 4, 4]));
  const fetchRange = vi.fn(async (start: number, end: number) => ({
    data: new Uint8Array(newData.subarray(start, end + 1)),
    total: newData.length,
  }));

  const built = await buildFromDelta(oldData, planDelta(oldBlocks, newBlocks), fetchRange);

  expect(Buffer.from(built).toString()).toBe('AAAABBBBCCCCDDDDAAAA');
  expect(fetchRange).toHaveBeenCalledWith(8, 15);
  await expect(buildFromDelta(
    oldData,
    [{ kind: 'fetch', start: 0, size: 4 }],
    async () => ({ data: bytes('abc'), total: newData.length }),
  )).rejects.toThrow('Short range');
});

test('F-07 downloadResumable 从已有部分接着下，分块追加，直到 total', async () => {
  const remote = bytes('ABCDEFGHIJKL');
  let downloaded = bytes('AB');
  const starts: number[] = [];
  const progress: Array<[number, number]> = [];

  await downloadResumable({
    fetchRange: async (start, end) => {
      starts.push(start);
      return {
        data: remote.subarray(start, Math.min(end + 1, remote.length)),
        total: remote.length,
      };
    },
    partPath: 'ignored.part',
    size: () => downloaded.length,
    append: (_path, data) => {
      downloaded = new Uint8Array(Buffer.concat([downloaded, data]));
    },
    chunk: 4,
    onProgress: (received, total) => progress.push([received, total]),
  });

  expect(starts).toEqual([2, 6, 10]);
  expect(Buffer.from(downloaded).toString()).toBe('ABCDEFGHIJKL');
  expect(progress).toEqual([[6, 12], [10, 12], [12, 12]]);
});
