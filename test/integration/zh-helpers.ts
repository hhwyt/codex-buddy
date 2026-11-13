// Helpers for the 汉化 tests: a fake Codex.app, a fake opener that records how it was called, and a tiny DevTools
// (CDP) server speaking just enough WebSocket for zh-runner.js.
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as http from 'node:http';
import type { Duplex } from 'node:stream';
import * as path from 'node:path';

export function hashTree(dir: string): string {
  const h = createHash('sha256');
  const walk = (d: string) => {
    for (const name of fs.readdirSync(d).sort()) {
      const p = path.join(d, name);
      h.update(path.relative(dir, p));
      if (fs.statSync(p).isDirectory()) walk(p); else h.update(fs.readFileSync(p));
    }
  };
  walk(dir);
  return h.digest('hex');
}

export function fakeCodexApp(app: string, opts: { version?: string; icon?: string | null } = {}): void {
  const contents = path.join(app, 'Contents');
  fs.mkdirSync(path.join(contents, 'MacOS'), { recursive: true });
  fs.mkdirSync(path.join(contents, 'Resources'), { recursive: true });
  const iconKey = opts.icon === null ? '' : `<key>CFBundleIconFile</key><string>electron.icns</string>`;
  fs.writeFileSync(path.join(contents, 'Info.plist'),
    `<plist><dict><key>CFBundleExecutable</key><string>ChatGPT</string>${iconKey}<key>CFBundleShortVersionString</key><string>${opts.version ?? '26.1027.61615'}</string></dict></plist>`);
  fs.writeFileSync(path.join(contents, 'MacOS', 'ChatGPT'), 'binary');
  if (opts.icon) fs.copyFileSync(opts.icon, path.join(contents, 'Resources', 'electron.icns'));
}

/** A node script that appends {args, codexHome} as one JSON line to record, then exits */
export function fakeOpener(dir: string, record: string): string {
  const file = path.join(dir, 'fake-open.js');
  fs.writeFileSync(file, `#!${process.execPath}\nrequire('fs').appendFileSync(${JSON.stringify(record)}, JSON.stringify({ args: process.argv.slice(2), codexHome: process.env.CODEX_HOME || null, runAsNode: process.env.ELECTRON_RUN_AS_NODE || null }) + '\\n');\n`);
  fs.chmodSync(file, 0o755);
  return file;
}

export const readRecord = (record: string): { args: string[]; codexHome: string | null; runAsNode: string | null }[] =>
  fs.existsSync(record) ? fs.readFileSync(record, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];

export async function waitFor<T>(fn: () => T | null | undefined | false, ms = 10_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('timed out');
    await new Promise(r => setTimeout(r, 50));
  }
}

function frame(text: string, opcode = 0x1): Buffer {
  const body = Buffer.from(text);
  const head = body.length < 126 ? Buffer.from([0x80 | opcode, body.length])
    : Buffer.from([0x80 | opcode, 126, body.length >> 8, body.length & 0xff]);
  return Buffer.concat([head, body]);
}

/** Fake DevTools on 127.0.0.1:port. Every message the runner sends lands in `received`; onMessage may answer */
export function cdpServer(port: number, onMessage: (msg: any, send: (msg: object) => void, close: () => void) => void) {
  const received: any[] = [];
  let peer: Duplex | null = null;
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/browser/x` }));
  });
  server.on('upgrade', (req, socket) => {
    peer = socket;
    const accept = createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    const send = (msg: object) => socket.write(frame(JSON.stringify(msg)));
    const close = () => { socket.write(frame('', 0x8)); socket.end(); };
    let buf = Buffer.alloc(0);
    socket.on('data', (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      for (;;) {
        if (buf.length < 2) return;
        const opcode = buf[0] & 0x0f;
        let len = buf[1] & 0x7f, off = 2;
        if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
        if (buf.length < off + 4 + len) return;
        const mask = buf.subarray(off, off + 4);
        const data = Buffer.from(buf.subarray(off + 4, off + 4 + len).map((b, i) => b ^ mask[i % 4]));
        buf = buf.subarray(off + 4 + len);
        if (opcode === 0x8) { socket.end(); return; }
        if (opcode === 0x1) { const msg = JSON.parse(data.toString()); received.push(msg); onMessage(msg, send, close); }
      }
    });
    socket.on('error', () => {});
  });
  const ready = new Promise<void>(r => server.listen(port, '127.0.0.1', () => r()));
  return { received, ready, stop: () => { peer?.destroy(); server.close(); } };
}
