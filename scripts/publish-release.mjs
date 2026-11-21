import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readPrivateKey, publicKeyIn, signConfigFile } from './sign-remote-config.mjs';

export const DISTRIBUTION_REPO = 'hhwyt/codex-buddy-releases';
export const sha256 = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/** Fixed release URLs and hashes of the exact installers being published. */
export function releaseMetadata(config, version, directory, { force = false } = {}) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid release version');
  const winName = `CodexBuddy-Setup-${version}.exe`;
  const macName = `CodexBuddy-${version}.dmg`;
  const base = `https://github.com/${DISTRIBUTION_REPO}/releases/download/v${version}`;
  return { ...config, minVersion: force ? version : config.minVersion, latest: { ...config.latest, version,
    winUrl: `${base}/${winName}`, macUrl: `${base}/${macName}`,
    winSha256: sha256(path.join(directory, winName)), macSha256: sha256(path.join(directory, macName)) } };
}

const gh = (args, body) => execFileSync('gh', args, { encoding: 'utf8', input: body === undefined ? undefined : JSON.stringify(body), stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const api = (endpoint, body) => JSON.parse(gh(['api', endpoint, ...(body === undefined ? [] : ['--method', 'POST', '--input', '-'])], body));

const parts = v => v.trim().replace(/^v/i, '').split(/[.-]/).map(x => parseInt(x, 10) || 0);

/** Same segment-wise numeric comparison as electron/core/updater.compareVersions (kept here so the script stays TS-free). */
const compare = (a, b) => {
  const x = parts(a), y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
};

/** Online remote/config.json in the distribution repository; null when it cannot be read. */
export function publishedConfig() {
  try {
    const file = JSON.parse(gh(['api', `repos/${DISTRIBUTION_REPO}/contents/remote/config.json`]));
    return file?.content ? JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')) : null;
  } catch { return null; }
}

/** One Git commit publishes config + signature together. No credential is uploaded to the distribution repository. */
function publishMetadata(files, version) {
  const prefix = `repos/${DISTRIBUTION_REPO}`;
  let head;
  try { head = api(`${prefix}/git/ref/heads/main`).object.sha; } catch {
    gh(['api', `${prefix}/contents/README.md`, '--method', 'PUT', '--input', '-'], {
      message: 'Initialize distribution repository', branch: 'main', content: Buffer.from('# CodexBuddy\n\n安装包和签名版本配置。\n').toString('base64'),
    });
    head = api(`${prefix}/git/ref/heads/main`).object.sha;
  }
  const base = api(`${prefix}/git/commits/${head}`).tree.sha;
  const tree = files.map(([name, bytes]) => ({ path: name, mode: '100644', type: 'blob',
    sha: api(`${prefix}/git/blobs`, { content: bytes.toString('base64'), encoding: 'base64' }).sha }));
  const built = api(`${prefix}/git/trees`, { base_tree: base, tree });
  const commit = api(`${prefix}/git/commits`, { message: `Publish CodexBuddy ${version}`, tree: built.sha, parents: [head] });
  gh(['api', `${prefix}/git/refs/heads/main`, '--method', 'PATCH', '--input', '-'], { sha: commit.sha, force: false });
}

/** Turn an already-published release into a forced upgrade: raise minVersion and resign, without repackaging. */
export function forceExisting(root, version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid release version');
  const published = publishedConfig();
  if (!published?.minVersion) throw new Error('No published config with a minimum version to force');
  const release = JSON.parse(gh(['release', 'view', `v${version}`, '--repo', DISTRIBUTION_REPO, '--json', 'isDraft']));
  if (release.isDraft) throw new Error(`Release v${version} is still a draft`);
  if (compare(version, published.minVersion) < 0) throw new Error(`Force version ${version} is below the published minimum ${published.minVersion}`);
  const metadataDir = fs.mkdtempSync(path.join(root, '.force-existing-'));
  const configPath = path.join(metadataDir, 'config.json');
  try {
    fs.writeFileSync(configPath, `${JSON.stringify({ ...published, minVersion: version }, null, 2)}\n`);
    const signature = signConfigFile(configPath, readPrivateKey(), publicKeyIn(path.join(root, 'electron/core/remote-key.ts')));
    publishMetadata([['remote/config.json', fs.readFileSync(configPath)], ['remote/config.json.sig', fs.readFileSync(signature)]], version);
    console.log(`Forced https://github.com/${DISTRIBUTION_REPO}/releases/tag/v${version}`);
  } finally { fs.rmSync(metadataDir, { recursive: true, force: true }); }
}

export function publishRelease(root, directory = path.join(root, 'release'), { force = false } = {}) {
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).version;
  // The repo's config with the minimum version that is live now: a normal release must not change who is locked out
  const repoConfig = JSON.parse(fs.readFileSync(path.join(root, 'remote', 'config.json')));
  const published = publishedConfig();
  const config = published ? { ...repoConfig, minVersion: published.minVersion } : repoConfig;
  const metadata = releaseMetadata(config, version, directory, { force });
  const metadataDir = fs.mkdtempSync(path.join(directory, '.metadata-'));
  const configPath = path.join(metadataDir, 'config.json');
  try {
    fs.writeFileSync(configPath, `${JSON.stringify(metadata, null, 2)}\n`);
    const signature = signConfigFile(configPath, readPrivateKey(), publicKeyIn(path.join(root, 'electron/core/remote-key.ts')));
    const tag = `v${version}`;
    // Release assets are immutable after publication: reruns publish only matching, already-uploaded installers.
    let release;
    try { release = JSON.parse(gh(['release', 'view', tag, '--repo', DISTRIBUTION_REPO, '--json', 'isDraft,assets'])); } catch { /* first publication */ }
    const installers = [path.join(directory, `CodexBuddy-Setup-${version}.exe`), path.join(directory, `CodexBuddy-${version}.dmg`)];
    if (!release) {
      // Initialize the repository before creating its first release tag.
      try { api(`repos/${DISTRIBUTION_REPO}/git/ref/heads/main`); } catch {
        gh(['api', `repos/${DISTRIBUTION_REPO}/contents/README.md`, '--method', 'PUT', '--input', '-'], {
          message: 'Initialize distribution repository', branch: 'main', content: Buffer.from('# CodexBuddy\n\n安装包和签名版本配置。\n').toString('base64'),
        });
      }
      gh(['release', 'create', tag, ...installers, '--repo', DISTRIBUTION_REPO, '--draft', '--target', 'main', '--title', `CodexBuddy ${version}`, '--notes', `CodexBuddy ${version}`]);
    } else {
      for (const file of installers) {
        const asset = release.assets.find(item => item.name === path.basename(file));
        if (!asset) {
          if (!release.isDraft) throw new Error('Published release is missing an installer');
          gh(['release', 'upload', tag, file, '--repo', DISTRIBUTION_REPO]);
          continue;
        }
        if (asset.digest === `sha256:${sha256(file)}`) continue;
        const temporary = fs.mkdtempSync(path.join(directory, '.verify-'));
        try {
          gh(['release', 'download', tag, '--repo', DISTRIBUTION_REPO, '--dir', temporary, '--pattern', path.basename(file)]);
          if (sha256(file) !== sha256(path.join(temporary, path.basename(file)))) throw new Error('Published installer differs; choose a new version');
        } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
      }
    }
    gh(['release', 'edit', tag, '--repo', DISTRIBUTION_REPO, '--draft=false', '--latest']);
    publishMetadata([['remote/config.json', fs.readFileSync(configPath)], ['remote/config.json.sig', fs.readFileSync(signature)]], version);
    const prefix = `repos/${DISTRIBUTION_REPO}`;
    try { api(`${prefix}/pages`); } catch { api(`${prefix}/pages`, { build_type: 'legacy', source: { branch: 'main', path: '/' } }); }
    console.log(`Published https://github.com/${DISTRIBUTION_REPO}/releases/tag/${tag}`);
    console.log('Version endpoint: https://hhwyt.xyz/codex-buddy-releases/remote/config.json');
  } finally { fs.rmSync(metadataDir, { recursive: true, force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const args = process.argv.slice(2);
  if (args[0] === '--force-existing') {
    forceExisting(root, args[1]);
  } else {
    const forceAt = args.indexOf('--force');
    const rest = args.filter((_, i) => i !== forceAt);
    publishRelease(root, rest[0] ? path.resolve(rest[0]) : undefined, { force: forceAt >= 0 });
  }
}
