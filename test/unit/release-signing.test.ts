// L1: release tooling for the signed remote config (scripts/gen-signing-key.mjs, scripts/sign-remote-config.mjs) and
// the packaged-build hardening config (package.json build.electronFuses). Owner: integration.
import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { verifySignature } from '../../electron/core/remote';
import { REMOTE_CONFIG_PUBLIC_KEY } from '../../electron/core/remote-key';
import { debuggable, debugSwitchesIn, DEBUG_SWITCHES } from '../../electron/main/hardening';
import { TEST_PRIVATE_KEY, TEST_PUBLIC_KEY } from '../fakes/remote-test-key.mjs';

const REPO = path.join(__dirname, '..', '..');
const SIGN = path.join(REPO, 'scripts', 'sign-remote-config.mjs');
const GEN = path.join(REPO, 'scripts', 'gen-signing-key.mjs');
const PKG = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-sign-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const run = (script: string, args: string[], env: Record<string, string> = {}) =>
  spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: { PATH: process.env.PATH ?? '', HOME: dir, ...env } });

describe('签名脚本', () => {
  const config = () => {
    const f = path.join(dir, 'config.json');
    fs.writeFileSync(f, fs.readFileSync(path.join(REPO, 'remote', 'config.json')));
    return f;
  };
  const pub = () => { const f = path.join(dir, 'pub.pem'); fs.writeFileSync(f, TEST_PUBLIC_KEY); return f; };

  test('签了再验：App 的 verifySignature 认这份签名，改一个字节就不认', () => {
    const f = config();
    const r = run(SIGN, [f, '--public-key', pub()], { CODEXBUDDY_SIGNING_KEY: TEST_PRIVATE_KEY });
    expect(r.status).toBe(0);
    const text = fs.readFileSync(f, 'utf8');
    const sig = fs.readFileSync(`${f}.sig`, 'utf8');
    expect(verifySignature(text, sig, TEST_PUBLIC_KEY)).toBe(true);
    expect(verifySignature(text.replace('"schema": 1', '"schema":1'), sig, TEST_PUBLIC_KEY)).toBe(false);
  });

  test('$CODEXBUDDY_SIGNING_KEY 也可以是私钥文件的路径', () => {
    const key = path.join(dir, 'k.pem');
    fs.writeFileSync(key, TEST_PRIVATE_KEY);
    expect(run(SIGN, [config(), '--public-key', pub()], { CODEXBUDDY_SIGNING_KEY: key }).status).toBe(0);
  });

  test('私钥和 App 内置公钥对不上：报错退出，不写 .sig', () => {
    const f = config();
    const r = run(SIGN, [f], { CODEXBUDDY_SIGNING_KEY: TEST_PRIVATE_KEY });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('remote-key.ts');
    expect(fs.existsSync(`${f}.sig`)).toBe(false);
  });

  test('没有私钥（没设环境变量，~/.codexbuddy 里也没有）：报错退出', () => {
    expect(run(SIGN, [config(), '--public-key', pub()]).status).toBe(1);
  });

  test('坏的 JSON 不签', () => {
    const f = path.join(dir, 'bad.json');
    fs.writeFileSync(f, '{not json');
    expect(run(SIGN, [f, '--public-key', pub()], { CODEXBUDDY_SIGNING_KEY: TEST_PRIVATE_KEY }).status).toBe(1);
    expect(fs.existsSync(`${f}.sig`)).toBe(false);
  });

  test('生成密钥：私钥 0600、目录 0700，不覆盖已有的；打印的公钥能验它签的东西', () => {
    const out = path.join(dir, 'keys', 'k.pem');
    const r = run(GEN, ['--out', out]);
    expect(r.status).toBe(0);
    // POSIX permission bits are not implemented by Windows chmod. Signing and overwrite protection run on both.
    if (process.platform !== 'win32') {
      expect(fs.statSync(out).mode & 0o777).toBe(0o600);
      expect(fs.statSync(path.dirname(out)).mode & 0o777).toBe(0o700);
    }
    const printed = /-----BEGIN PUBLIC KEY-----[\s\S]+?-----END PUBLIC KEY-----/.exec(r.stdout)![0];
    expect(r.stdout).toMatch(/fingerprint: ([0-9a-f]{2}:){31}[0-9a-f]{2}/);
    expect(r.stdout).not.toContain('PRIVATE KEY');
    const f = config();
    const pubFile = path.join(dir, 'printed.pem');
    fs.writeFileSync(pubFile, printed);
    expect(run(SIGN, [f, '--public-key', pubFile], { CODEXBUDDY_SIGNING_KEY: out }).status).toBe(0);
    expect(verifySignature(fs.readFileSync(f, 'utf8'), fs.readFileSync(`${f}.sig`, 'utf8'), printed)).toBe(true);
    const again = run(GEN, ['--out', out]);
    expect(again.status).toBe(1);
    expect(again.stderr).toContain('already exists');
  });

  test('仓库里没有私钥，.gitignore 挡住 .pem', () => {
    const tracked = execFileSync('git', ['ls-files'], { cwd: REPO, encoding: 'utf8' }).split('\n');
    expect(tracked.filter(f => /\.pem$|remote-config-ed25519/.test(f))).toEqual([]);
    expect(fs.readFileSync(path.join(REPO, '.gitignore'), 'utf8')).toMatch(/^\*\.pem$/m);
    expect(REMOTE_CONFIG_PUBLIC_KEY).not.toBe(TEST_PUBLIC_KEY);
  });
});

describe('打包加固', () => {
  test('electron-builder 打开 fuses：不认 NODE_OPTIONS / --inspect，只从完整性校验过的 app.asar 加载，cookie 加密', () => {
    expect(PKG.build.asar).toBe(true);
    expect(PKG.build.electronFuses).toEqual({
      runAsNode: false, // the runAsNode fuse is off; the 汉化 runner runs on our Electron via --run-script (platform/zh-mac.ts, clone-win.ts)
      enableNodeOptionsEnvironmentVariable: false,
      enableNodeCliInspectArguments: false,
      enableEmbeddedAsarIntegrityValidation: true,
      onlyLoadAppFromAsar: true,
      enableCookieEncryption: true,
    });
  });

  test('驱动测试用的包（dist:drive）不开 fuses，并标成可调试', () => {
    const drive = require(path.join(REPO, 'build', 'drive.config.cjs'));
    expect(drive.electronFuses).toBeNull();
    expect(drive.extraMetadata).toEqual({ codexbuddyDebuggable: true });
    expect({ ...drive, electronFuses: PKG.build.electronFuses, extraMetadata: undefined }).toEqual({ ...PKG.build, extraMetadata: undefined });
    expect(PKG.scripts['dist:drive']).toContain('build/drive.config.cjs');
  });

  test('正式包不能调试：命令行带调试开关就不启动；仓库里跑和驱动包可以', () => {
    expect(debuggable(true, {})).toBe(false);
    expect(debuggable(true, { codexbuddyDebuggable: 'true' })).toBe(false);
    expect(debuggable(true, { codexbuddyDebuggable: true })).toBe(true);
    expect(debuggable(false, {})).toBe(true);
    expect(debugSwitchesIn(s => s === 'remote-debugging-port')).toEqual(['remote-debugging-port']);
    expect(debugSwitchesIn(() => false)).toEqual([]);
    expect(DEBUG_SWITCHES).toContain('inspect');
  });
});
