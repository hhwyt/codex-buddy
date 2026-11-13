// The real FileSystem (node:fs). Owner: Base. remove() exists only for core/guard.ts.
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { FileSystem } from '../core/types';

export const nodeFs: FileSystem = {
  readText: file => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null),
  writeText: (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text, 'utf8'); },
  readBytes: file => (fs.existsSync(file) ? new Uint8Array(fs.readFileSync(file)) : null),
  writeBytes: (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, data); },
  exists: file => fs.existsSync(file),
  mkdirp: dir => { fs.mkdirSync(dir, { recursive: true }); },
  copy: (from, to) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.cpSync(from, to, { recursive: true }); },
  list: dir => (fs.existsSync(dir) ? fs.readdirSync(dir) : []),
  remove: target => { fs.rmSync(target, { recursive: true, force: true }); },
};
