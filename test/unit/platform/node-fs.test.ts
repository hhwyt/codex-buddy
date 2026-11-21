// S-10: 存钥匙和状态的文件/目录显式设权限。Windows 上 mode 无效，只在 Mac/Linux 上跑。
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, test } from 'vitest';
import { nodeFs } from '../../../electron/platform/node-fs';

describe.runIf(process.platform !== 'win32')('node-fs 权限', () => {
  test('写出的文件是 0o600，新建的目录是 0o700', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-nodefs-'));
    try {
      const file = path.join(dir, 'nested', 'state.json');
      nodeFs.writeText(file, '{"x":1}');
      expect(fs.statSync(file).mode & 0o777).toBe(0o600);
      expect(fs.statSync(path.dirname(file)).mode & 0o777).toBe(0o700);
      const bytes = path.join(dir, 'nested', 'data-key.bin');
      nodeFs.writeBytes(bytes, new Uint8Array([1, 2, 3]));
      expect(fs.statSync(bytes).mode & 0o777).toBe(0o600);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
