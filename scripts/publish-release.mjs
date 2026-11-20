import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readPrivateKey, publicKeyIn, signConfigFile } from './sign-remote-config.mjs';

export const DISTRIBUTION_REPO = 'hhwyt/codex-buddy-releases';
export const sha256 = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/** Fixed release URLs and hashes of the exact installers being published. */
export function releaseMetadata(config, version, directory) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid release version');
  const winName = `CodexBuddy-Setup-${version}.exe`;
  const macName = `CodexBuddy-${version}.dmg`;
  const base = `https://github.com/${DISTRIBUTION_REPO}/releases/download/v${version}`;
  return { ...config, minVersion: version, latest: { ...config.latest, version,
    winUrl: `${base}/${winName}`, macUrl: `${base}/${macName}`,
    winSha256: sha256(path.join(directory, winName)), macSha256: sha256(path.join(directory, macName)) } };
}

const gh = (args, body) => execFileSync('gh', args, { encoding: 'utf8', input: body === undefined ? undefined : JSON.stringify(body), stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const api = (endpoint, body) => JSON.parse(gh(['api', endpoint, ...(body === undefined ? [] : ['--method', 'POST', '--input', '-'])], body));

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

export function publishRelease(root, directory = path.join(root, 'release')) {
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).version;
  const configPath = path.join(root, 'remote', 'config.json');
  const metadata = releaseMetadata(JSON.parse(fs.readFileSync(configPath)), version, directory);
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
    gh(['release', 'create', tag, ...installers, '--repo', DISTRIBUTION_REPO, '--draft', '--target', 'main', '--title', `CodexBuddy ${version}`, '--notes', '联网版本校验、强制升级和安装包校验']);
  } else {
    const temporary = fs.mkdtempSync(path.join(directory, '.verify-'));
    try {
      gh(['release', 'download', tag, '--repo', DISTRIBUTION_REPO, '--dir', temporary]);
      for (const file of installers) {
        if (sha256(file) !== sha256(path.join(temporary, path.basename(file)))) throw new Error('Published installer differs; choose a new version');
      }
    } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
  }
  gh(['release', 'edit', tag, '--repo', DISTRIBUTION_REPO, '--draft=false', '--latest']);
  publishMetadata([['remote/config.json', fs.readFileSync(configPath)], ['remote/config.json.sig', fs.readFileSync(signature)]], version);
  const prefix = `repos/${DISTRIBUTION_REPO}`;
  try { api(`${prefix}/pages`); } catch { api(`${prefix}/pages`, { build_type: 'legacy', source: { branch: 'main', path: '/' } }); }
  console.log(`Published https://github.com/${DISTRIBUTION_REPO}/releases/tag/${tag}`);
  console.log('Version endpoint: https://hhwyt.xyz/codex-buddy-releases/remote/config.json');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  publishRelease(root, process.argv[2] ? path.resolve(process.argv[2]) : undefined);
}
