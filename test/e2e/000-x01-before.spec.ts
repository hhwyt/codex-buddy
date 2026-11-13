// X-01 part 1: runs first (files run in name order on the single worker). Records read-only hashes of the real
// ~/.codex, ~/.codex-*, /Applications/ChatGPT.app, the 汉化版 entry and Codex's data dir, plus the /Applications
// listing, before any other L4 spec starts. zzz-x01-after.spec.ts compares after the whole suite. Owner: A7.
import { test } from '@playwright/test';
import * as fs from 'node:fs';
import { applicationsListing, hashAll, realProtectedPaths, SNAPSHOT_FILE } from './hash';

test('X-01 跑全部端到端之前，记下真实 ~/.codex 和 ChatGPT.app 的哈希', () => {
  const snapshot = { at: Date.now(), hashes: hashAll(realProtectedPaths()), applications: applicationsListing() };
  fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(snapshot));
});
