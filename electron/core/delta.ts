// Smaller upgrade downloads (design/approved-spec.md F-06, F-07). An installer published with its electron-builder
// .blockmap can be rebuilt from the installer of the version already on this computer plus only the blocks that
// changed (about 2% between two builds); everything else is a resumable download in fixed-size ranges. The caller
// always checks the finished file against the SHA-256 in the signed remote config, so a wrong block map or base file
// can only make the result fail that check, never install something else.
import { gunzipSync } from 'node:zlib';

export interface Block { offset: number; size: number; checksum: string }
export type Piece = { kind: 'copy'; from: number; size: number } | { kind: 'fetch'; start: number; size: number };
/** Inclusive byte range [start, end] of the remote file; total is the whole file's size (from Content-Range) */
export type FetchRange = (start: number, end: number) => Promise<{ data: Uint8Array; total: number }>;

/** Blocks of an electron-builder .blockmap (gzip JSON {files: [{checksums, sizes}]}), with their offsets */
export function parseBlockmap(gz: Uint8Array): Block[] {
  const map = JSON.parse(gunzipSync(gz).toString('utf8')) as { files?: { checksums?: string[]; sizes?: number[] }[] };
  const file = map.files?.[0];
  if (!file?.checksums || !file.sizes || file.checksums.length !== file.sizes.length) throw new Error('Invalid blockmap');
  let offset = 0;
  return file.checksums.map((checksum, i) => {
    const size = file.sizes![i];
    if (!Number.isSafeInteger(size) || size <= 0) throw new Error('Invalid blockmap');
    const block = { offset, size, checksum };
    offset += size;
    return block;
  });
}

/** How to build the new file: copy each block the old file already has, fetch the rest; neighbours are merged */
export function planDelta(oldBlocks: Block[], newBlocks: Block[]): Piece[] {
  const have = new Map<string, Block>();
  for (const b of oldBlocks) if (!have.has(`${b.checksum}:${b.size}`)) have.set(`${b.checksum}:${b.size}`, b);
  const pieces: Piece[] = [];
  for (const b of newBlocks) {
    const old = have.get(`${b.checksum}:${b.size}`);
    const last = pieces[pieces.length - 1];
    if (old) {
      if (last?.kind === 'copy' && last.from + last.size === old.offset) last.size += b.size;
      else pieces.push({ kind: 'copy', from: old.offset, size: b.size });
    } else if (last?.kind === 'fetch' && last.start + last.size === b.offset) last.size += b.size;
    else pieces.push({ kind: 'fetch', start: b.offset, size: b.size });
  }
  return pieces;
}

/** Bytes that have to come over the network for this plan */
export const fetchSize = (pieces: Piece[]): number => pieces.reduce((n, p) => n + (p.kind === 'fetch' ? p.size : 0), 0);

/** The new file from the old one and the fetched ranges; onProgress counts fetched bytes only */
export async function buildFromDelta(old: Uint8Array, pieces: Piece[], fetchRange: FetchRange,
  onProgress?: (fetched: number, toFetch: number) => void): Promise<Uint8Array> {
  const toFetch = fetchSize(pieces);
  const parts: Uint8Array[] = [];
  let fetched = 0;
  for (const p of pieces) {
    if (p.kind === 'copy') {
      if (p.from + p.size > old.length) throw new Error('Base file too short');
      parts.push(old.subarray(p.from, p.from + p.size));
      continue;
    }
    const { data } = await fetchRange(p.start, p.start + p.size - 1);
    if (data.length !== p.size) throw new Error('Short range');
    parts.push(data);
    fetched += p.size;
    onProgress?.(fetched, toFetch);
  }
  return new Uint8Array(Buffer.concat(parts));
}

/** Resumable download into partPath: continues from what is already there, in ranges of `chunk` bytes */
export async function downloadResumable(opts: {
  fetchRange: FetchRange;
  partPath: string;
  size(path: string): number | null;
  append(path: string, data: Uint8Array): void;
  chunk?: number;
  onProgress?: (received: number, total: number) => void;
}): Promise<void> {
  const chunk = opts.chunk ?? 4 * 1024 * 1024;
  let received = opts.size(opts.partPath) ?? 0;
  let total = Infinity;
  while (received < total) {
    const { data, total: remoteTotal } = await opts.fetchRange(received, received + chunk - 1);
    total = remoteTotal;
    if (received > total) throw new Error('Partial file larger than the remote file');
    if (data.length === 0 && received < total) throw new Error('Empty range');
    opts.append(opts.partPath, data);
    received += data.length;
    opts.onProgress?.(received, total);
  }
}
